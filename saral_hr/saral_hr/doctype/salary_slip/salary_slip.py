import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day, flt
import calendar
from datetime import timedelta
from dateutil.relativedelta import relativedelta
import json
from PyPDF2 import PdfMerger
import os
from frappe.utils.pdf import get_pdf


class SalarySlip(Document):
    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


@frappe.whitelist()
def check_duplicate_salary_slip(employee, start_date, current_doc=""):
    """
    Check if a Draft or Submitted salary slip already exists for this employee + month.
    Cancelled slips (docstatus=2) are ignored.
    Returns {"status": "duplicate", "message": "..."} or {"status": "ok"}
    """
    filters = {
        "employee": employee,
        "start_date": start_date,
        "docstatus": ["in", [0, 1]]   # 0 = Draft, 1 = Submitted (skip 2 = Cancelled)
    }

    existing = frappe.db.get_value(
        "Salary Slip",
        filters,
        ["name", "docstatus"],
        as_dict=True
    )

    if not existing:
        return {"status": "ok"}

    # If we are re-opening the same doc, it is not a duplicate
    if current_doc and existing.name == current_doc:
        return {"status": "ok"}

    status_label = "Draft" if existing.docstatus == 0 else "Submitted"
    return {
        "status": "duplicate",
        "message": f"Salary Slip {existing.name} already exists for this employee in {status_label} state."
    }


@frappe.whitelist()
def get_salary_structure_for_employee(employee, start_date=None):
    """
    Fetch the Salary Structure Assignment that is active as of start_date.
    Filters: from_date <= start_date AND (to_date IS NULL OR to_date >= start_date)
    Falls back to the most-recent assignment if none found for the exact date.
    """
    filters = {"employee": employee}
    if start_date:
        filters["from_date"] = ["<=", start_date]

    ssa_list = frappe.db.get_all(
        "Salary Structure Assignment",
        filters=filters,
        fields=["name", "from_date", "to_date"],
        order_by="from_date desc"
    )

    # Pick the first assignment whose to_date covers start_date (or is open-ended)
    ssa_name = None
    if start_date:
        for ssa in ssa_list:
            if not ssa.to_date or getdate(ssa.to_date) >= getdate(start_date):
                ssa_name = ssa.name
                break

    # Fallback: just take the most recent one
    if not ssa_name and ssa_list:
        ssa_name = ssa_list[0].name

    if not ssa_name:
        return None

    ssa_doc = frappe.get_doc("Salary Structure Assignment", ssa_name)

    earnings = []
    deductions = []

    current_month = None
    if start_date:
        start_date_obj = getdate(start_date)
        month_names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]
        current_month = month_names[start_date_obj.month - 1]

    added_earnings = set()
    added_deductions = set()

    for row in ssa_doc.earnings:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            [
                "salary_component_abbr",
                "depends_on_payment_days",
                "is_special_component",
                "type"
            ],
            as_dict=True
        )

        amount = row.amount
        if comp.is_special_component and current_month:
            special_amount = get_special_component_amount(row.salary_component, current_month)
            if special_amount is not None:
                amount = special_amount
            else:
                continue

        earnings.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": amount,
            "depends_on_payment_days": comp.depends_on_payment_days,
            "is_special_component": comp.is_special_component
        })
        added_earnings.add(row.salary_component)

    for row in ssa_doc.deductions:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            [
                "salary_component_abbr",
                "employer_contribution",
                "depends_on_payment_days",
                "is_special_component",
                "type"
            ],
            as_dict=True
        )

        amount = row.amount
        if comp.is_special_component and current_month:
            special_amount = get_special_component_amount(row.salary_component, current_month)
            if special_amount is not None:
                amount = special_amount
            else:
                continue

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": amount,
            "employer_contribution": comp.employer_contribution,
            "depends_on_payment_days": comp.depends_on_payment_days,
            "is_special_component": comp.is_special_component
        })
        added_deductions.add(row.salary_component)

    if current_month:
        all_special_components = frappe.get_all(
            "Salary Component",
            filters={"is_special_component": 1},
            fields=[
                "name",
                "salary_component_abbr",
                "type",
                "depends_on_payment_days",
                "employer_contribution"
            ]
        )

        for comp in all_special_components:
            special_amount = get_special_component_amount(comp.name, current_month)

            if special_amount is not None and special_amount > 0:
                if comp.type == "Earning" and comp.name not in added_earnings:
                    earnings.append({
                        "salary_component": comp.name,
                        "abbr": comp.salary_component_abbr,
                        "amount": special_amount,
                        "depends_on_payment_days": comp.depends_on_payment_days,
                        "is_special_component": 1
                    })

                elif comp.type == "Deduction" and comp.name not in added_deductions:
                    deductions.append({
                        "salary_component": comp.name,
                        "abbr": comp.salary_component_abbr,
                        "amount": special_amount,
                        "employer_contribution": comp.employer_contribution,
                        "depends_on_payment_days": comp.depends_on_payment_days,
                        "is_special_component": 1
                    })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


def get_special_component_amount(component_name, month):
    component_doc = frappe.get_doc("Salary Component", component_name)

    if not component_doc.is_special_component:
        return None

    for row in component_doc.enter_amount_according_to_months:
        if row.month == month:
            amount = flt(row.amount)
            return amount if amount > 0 else None

    return None


@frappe.whitelist()
def get_variable_pay_percentage(employee, start_date):
    if not employee or not start_date:
        return None

    division = frappe.db.get_value("Company Link", employee, "division")
    if not division:
        return None

    date_obj = getdate(start_date)
    year = str(date_obj.year)
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    month = month_names[date_obj.month - 1]

    vpa_name = f"{year} - {month}"

    if not frappe.db.exists("Variable Pay Assignment", vpa_name):
        return None

    vpa_doc = frappe.get_doc("Variable Pay Assignment", vpa_name)

    for row in vpa_doc.variable_pay:
        if row.division == division:
            return flt(row.percentage)

    return None


@frappe.whitelist()
def get_attendance_and_days(employee, start_date, working_days_calculation_method=None):
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)

    if not working_days_calculation_method:
        working_days_calculation_method = frappe.db.get_value(
            "Company Link",
            employee,
            "salary_calculation_based_on"
        )

    if working_days_calculation_method == "No. of days in a month":
        calculation_method = "Include Weekly Offs"
    else:
        calculation_method = "Exclude Weekly Offs"

    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")
    total_days = calendar.monthrange(start_date.year, start_date.month)[1]

    weekly_off_count = 0
    day_map = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2,
        "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6
    }

    if weekly_off:
        off_day = day_map.get(weekly_off)
        if off_day is not None:
            current = start_date
            while current <= end_date:
                if current.weekday() == off_day:
                    weekly_off_count += 1
                current += timedelta(days=1)

    attendance = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]]
        },
        fields=["status"]
    )

    present_days = 0
    absent_days = 0
    half_day_count = 0
    lwp_days = 0  # <-- NEW: track LWP separately

    for a in attendance:
        if a.status in ["Present", "On Leave"]:
            present_days += 1
        elif a.status == "Half Day":
            half_day_count += 1
            present_days += 0.5
            absent_days += 0.5
        elif a.status == "Absent":
            absent_days += 1
        elif a.status == "LWP":
            lwp_days += 1  # <-- NEW: count each LWP record as 1 absent day

    total_half_days = flt(half_day_count * 0.5, 2)

    # <-- NEW: combine raw absent + LWP into the single absent_days figure
    # used for payment_days calculation and salary deduction
    combined_absent_days = flt(absent_days + lwp_days, 2)

    if calculation_method == "Include Weekly Offs":
        working_days = total_days
        payment_days = flt(total_days - combined_absent_days, 2)
    else:
        working_days = total_days - weekly_off_count
        payment_days = flt(working_days - combined_absent_days, 2)

    return {
        "total_days": total_days,
        "weekly_offs": weekly_off_count,
        "working_days": working_days,
        "payment_days": payment_days,
        "present_days": present_days,
        "absent_days": combined_absent_days,   # combined absent + LWP
        "total_half_days": total_half_days,
        "total_lwp": flt(lwp_days, 2),         # <-- NEW: raw LWP count for the field
        "calculation_method": calculation_method
    }


@frappe.whitelist()
def get_eligible_employees_for_salary_slip(company, year, month):
    """
    Fetch eligible employees for bulk salary slip generation.
    Excludes employees who already have either DRAFT or SUBMITTED salary slips.
    Only shows employees who have NO salary slip for the selected period.
    """
    from datetime import datetime

    month_map = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
    }
    month_num = month_map.get(month)

    if not month_num:
        frappe.throw("Invalid month")

    start_date = f"{year}-{month_num:02d}-01"
    start_date_obj = getdate(start_date)
    end_date = get_last_day(start_date_obj)

    employees = frappe.db.sql("""
        SELECT DISTINCT
            cl.name,
            cl.full_name as employee_name,
            cl.department,
            cl.designation,
            cl.company
        FROM
            `tabCompany Link` cl
        INNER JOIN
            `tabSalary Structure Assignment` ssa ON ssa.employee = cl.name
        WHERE
            cl.is_active = 1
            AND cl.company = %(company)s
            AND ssa.from_date <= %(start_date)s
            AND (ssa.to_date IS NULL OR ssa.to_date >= %(start_date)s)
    """, {"company": company, "start_date": start_date}, as_dict=1)

    eligible_employees = []

    for emp in employees:
        # Exclude employees who have ANY salary slip (draft or submitted)
        # Only show employees with NO salary slip for this period
        existing_slip = frappe.db.exists("Salary Slip", {
            "employee": emp.name,
            "start_date": start_date,
            "docstatus": ["in", [0, 1]]  # 0 = Draft, 1 = Submitted
        })

        if existing_slip:
            continue

        # Check if attendance exists for this employee in this period
        attendance_count = frappe.db.count("Attendance", {
            "employee": emp.name,
            "attendance_date": ["between", [start_date_obj, end_date]]
        })

        if attendance_count > 0:
            eligible_employees.append(emp)

    return eligible_employees


@frappe.whitelist()
def bulk_generate_salary_slips(employees, year, month):
    """
    COMPLETELY FIXED: Now replicates the exact manual calculation logic
    """
    import json
    from datetime import datetime

    if isinstance(employees, str):
        employees = json.loads(employees)

    month_map = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
    }
    month_num = month_map.get(month)

    if not month_num:
        return {"success": 0, "failed": len(employees), "errors": ["Invalid month"]}

    start_date = f"{year}-{month_num:02d}-01"

    success_count = 0
    failed_count = 0
    errors = []

    for emp_data in employees:
        try:
            employee = emp_data.get('employee')

            # Fetch salary structure
            salary_data = get_salary_structure_for_employee(employee, start_date)

            if not salary_data:
                errors.append(f"{emp_data.get('employee_name', employee)}: No salary structure found")
                failed_count += 1
                continue

            # Fetch attendance and days calculation
            attendance_data = get_attendance_and_days(employee, start_date)

            if not attendance_data:
                errors.append(f"{emp_data.get('employee_name', employee)}: Could not fetch attendance")
                failed_count += 1
                continue

            # FIXED: Get variable pay percentage and convert properly
            variable_pay_pct = get_variable_pay_percentage(employee, start_date)
            if variable_pay_pct is None:
                variable_pay_pct = 0

            # Convert percentage to decimal (e.g., 80% becomes 0.80)
            variable_pay_decimal = flt(variable_pay_pct) / 100.0

            # Create new salary slip
            salary_slip = frappe.new_doc("Salary Slip")
            salary_slip.employee = employee
            salary_slip.start_date = start_date
            salary_slip.end_date = get_last_day(getdate(start_date))
            salary_slip.currency = "INR"
            salary_slip.salary_structure = salary_data.get('salary_structure')

            # Set attendance data
            salary_slip.total_working_days = attendance_data.get('working_days')
            salary_slip.payment_days = attendance_data.get('payment_days')
            salary_slip.present_days = attendance_data.get('present_days')
            salary_slip.absent_days = attendance_data.get('absent_days')   # already includes LWP
            salary_slip.weekly_offs_count = attendance_data.get('weekly_offs')
            salary_slip.total_half_days = attendance_data.get('total_half_days')
            salary_slip.total_lwp = attendance_data.get('total_lwp', 0)    # <-- NEW

            # Add earnings with base_amount
            for earning in salary_data.get('earnings', []):
                row = salary_slip.append('earnings', {})
                row.salary_component = earning.get('salary_component')
                row.abbr = earning.get('abbr')
                row.amount = earning.get('amount')
                row.base_amount = earning.get('amount')  # Set base_amount
                row.depends_on_payment_days = earning.get('depends_on_payment_days')
                row.is_special_component = earning.get('is_special_component')

            # Add deductions with base_amount
            for deduction in salary_data.get('deductions', []):
                row = salary_slip.append('deductions', {})
                row.salary_component = deduction.get('salary_component')
                row.abbr = deduction.get('abbr')
                row.amount = deduction.get('amount')
                row.base_amount = deduction.get('amount')  # Set base_amount
                row.employer_contribution = deduction.get('employer_contribution')
                row.depends_on_payment_days = deduction.get('depends_on_payment_days')
                row.is_special_component = deduction.get('is_special_component')

            # FIXED: Calculate amounts using the EXACT same logic as manual form
            calculate_salary_slip_amounts_exact(salary_slip, variable_pay_decimal, start_date)

            # Insert the salary slip
            salary_slip.insert(ignore_permissions=True)
            success_count += 1

            frappe.db.commit()

        except Exception as e:
            errors.append(f"{emp_data.get('employee_name', employee)}: {str(e)}")
            failed_count += 1
            frappe.log_error(f"Error generating salary slip for {employee}: {str(e)}", "Bulk Salary Slip Generation")
            frappe.db.rollback()

    return {
        "success": success_count,
        "failed": failed_count,
        "errors": errors
    }


def calculate_salary_slip_amounts_exact(salary_slip, variable_pay_percentage, start_date):
    """
    COMPLETELY REWRITTEN: This now exactly replicates the client-side recalculate_salary() function
    """
    total_earnings = 0
    total_deductions = 0
    total_basic_da = 0
    total_employer_contribution = 0
    retention = 0

    wd = flt(salary_slip.total_working_days)
    pd = flt(salary_slip.payment_days)
    variable_pct = flt(variable_pay_percentage)

    basic_amount = 0
    da_amount = 0
    conveyance_amount = 0

    # ================= EARNINGS - EXACT REPLICA =================
    for row in salary_slip.earnings:
        base = flt(row.base_amount or row.amount or 0)
        row.base_amount = base

        amount = 0

        # Check if this is a variable component
        if row.salary_component and row.salary_component.lower().find("variable") != -1:
            # Variable component logic
            if wd > 0 and row.depends_on_payment_days:
                amount = (base / wd) * pd * variable_pct
            else:
                amount = base * variable_pct
        else:
            # Regular component logic
            if row.depends_on_payment_days and wd > 0:
                amount = (base / wd) * pd
            else:
                amount = base

        row.amount = flt(amount, 2)
        total_earnings += row.amount

        comp = (row.salary_component or "").lower()

        if "basic" in comp:
            basic_amount = row.amount
        if "da" in comp or "dearness" in comp:
            da_amount = row.amount
        if "conveyance" in comp:
            conveyance_amount = row.amount

    total_basic_da = basic_amount + da_amount

    # ================= DEDUCTIONS - EXACT REPLICA =================
    for row in salary_slip.deductions:
        base = flt(row.base_amount or row.amount or 0)
        row.base_amount = base

        amount = 0
        comp = (row.salary_component or "").lower()

        # ===== ESIC EMPLOYEE =====
        if "esic" in comp and "employer" not in comp:
            if base > 0:
                if total_earnings < 21000:
                    amount = flt((total_earnings - conveyance_amount) * 0.0075, 2)
                else:
                    amount = 0
            else:
                amount = 0

        # ===== ESIC EMPLOYER =====
        elif "esic" in comp and "employer" in comp:
            if base > 0:
                if total_earnings < 21000:
                    amount = flt((total_earnings - conveyance_amount) * 0.0325, 2)
                else:
                    amount = 0
            else:
                amount = 0

        # ===== PF =====
        elif "pf" in comp or "provident" in comp:
            if base > 0:
                basic_da_total = basic_amount + da_amount
                if basic_da_total >= 15000:
                    amount = 1800
                else:
                    amount = flt(basic_da_total * 0.12, 2)
            else:
                amount = 0

        # ===== PT (Professional Tax) =====
        elif "pt" in comp or "professional tax" in comp:
            if base > 0:
                start_date_obj = getdate(start_date)
                month = start_date_obj.month
                if month == 2:  # February
                    amount = 300
                else:
                    amount = 200
            else:
                amount = 0

        # ===== Other Deductions =====
        else:
            if row.depends_on_payment_days and wd > 0 and base > 0:
                amount = (base / wd) * pd
            else:
                amount = base

        row.amount = flt(amount, 2)

        if row.employer_contribution:
            total_employer_contribution += row.amount
        else:
            total_deductions += row.amount

        if "retention" in comp:
            retention += row.amount

    # Set totals
    net_salary = flt(total_earnings - total_deductions, 2)

    salary_slip.total_earnings = flt(total_earnings, 2)
    salary_slip.total_deductions = flt(total_deductions, 2)
    salary_slip.net_salary = net_salary
    salary_slip.total_basic_da = flt(total_basic_da, 2)
    salary_slip.total_employer_contribution = flt(total_employer_contribution, 2)
    salary_slip.retention = flt(retention, 2)


@frappe.whitelist()
def get_submitted_salary_slips(company, year, month):
    month_map = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
    }
    month_num = month_map.get(month)

    if not month_num:
        frappe.throw("Invalid month")

    start_date = f"{year}-{month_num:02d}-01"

    salary_slips = frappe.db.sql("""
        SELECT
            ss.name,
            ss.employee,
            ss.employee_name,
            ss.department,
            ss.designation,
            ss.net_salary,
            ss.start_date,
            ss.end_date
        FROM
            `tabSalary Slip` ss
        WHERE
            ss.docstatus = 1
            AND ss.start_date = %(start_date)s
            AND ss.company = %(company)s
        ORDER BY
            ss.employee_name
    """, {"company": company, "start_date": start_date}, as_dict=1)

    return salary_slips


@frappe.whitelist()
def bulk_print_salary_slips(salary_slip_names):
    if isinstance(salary_slip_names, str):
        salary_slip_names = json.loads(salary_slip_names)

    if not salary_slip_names:
        frappe.throw("No salary slips selected")

    merger = PdfMerger()
    temp_files = []

    try:
        for slip_name in salary_slip_names:
            slip_doc = frappe.get_doc("Salary Slip", slip_name)
            html = generate_bulk_print_html(slip_doc)

            pdf_options = {
                "page-size": "A4",
                "orientation": "Portrait",
                "margin-top": "10mm",
                "margin-right": "10mm",
                "margin-bottom": "10mm",
                "margin-left": "10mm",
                "encoding": "UTF-8",
                "no-outline": None,
                "enable-local-file-access": None
            }

            pdf_data = get_pdf(html, options=pdf_options)
            temp_file = frappe.utils.get_files_path(f"temp_slip_{slip_name}.pdf", is_private=1)
            temp_files.append(temp_file)

            with open(temp_file, "wb") as f:
                f.write(pdf_data)

            merger.append(temp_file)

        timestamp = frappe.utils.now_datetime().strftime("%Y%m%d_%H%M%S")
        final_filename = f"Salary_Slips_{timestamp}.pdf"
        final_filepath = frappe.utils.get_files_path(final_filename, is_private=1)

        with open(final_filepath, "wb") as f:
            merger.write(f)

        merger.close()

        file_doc = frappe.get_doc({
            "doctype": "File",
            "file_name": final_filename,
            "is_private": 1,
            "file_url": f"/private/files/{final_filename}"
        })
        file_doc.insert(ignore_permissions=True)
        frappe.db.commit()

        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)

        return {
            "pdf_url": file_doc.file_url,
            "file_name": final_filename
        }

    except Exception as e:
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass

        frappe.log_error(f"Error in bulk print: {str(e)}", "Bulk Print Salary Slips")
        frappe.throw(f"Error generating PDF: {str(e)}")


def generate_bulk_print_html(doc):
    from frappe.utils import fmt_money, formatdate, money_in_words

    company_address = frappe.db.get_value("Company", doc.company, "address") if doc.company else ""

    company_link_details = frappe.db.get_value(
        "Company Link",
        doc.employee,
        ["employee", "date_of_joining", "designation", "department", "branch", "category", "division"],
        as_dict=1
    ) if doc.employee else {}

    doj = company_link_details.get('date_of_joining') if company_link_details else None
    employee_link = company_link_details.get('employee') if company_link_details else None
    designation = company_link_details.get('designation') if company_link_details else None
    department = company_link_details.get('department') if company_link_details else None
    branch = company_link_details.get('branch') if company_link_details else None
    category = company_link_details.get('category') if company_link_details else None
    division = company_link_details.get('division') if company_link_details else None

    employee_details = frappe.db.get_value(
        "Employee",
        employee_link,
        ["employee_pf_account", "esic_number", "lin_number", "bank_name", "account_number", "ifsc_code", "gender"],
        as_dict=1
    ) if employee_link else {}

    present_days = (doc.total_working_days or 0) - (doc.absent_days or 0)

    salary_assignment = frappe.db.sql("""
        SELECT name, from_date, to_date
        FROM `tabSalary Structure Assignment`
        WHERE employee = %s
        AND from_date <= %s
        AND (to_date IS NULL OR to_date >= %s)
        ORDER BY from_date DESC
        LIMIT 1
    """, (doc.employee, doc.end_date, doc.start_date), as_dict=1)

    assignment_name = salary_assignment[0].name if salary_assignment else None

    assignment_earnings = []
    assignment_earnings_total = 0
    if assignment_name:
        assignment_earnings = frappe.db.sql("""
            SELECT salary_component, amount
            FROM `tabSalary Details`
            WHERE parent = %s
            AND parenttype = 'Salary Structure Assignment'
            AND parentfield = 'earnings'
            AND amount > 0
            ORDER BY idx ASC
        """, (assignment_name,), as_dict=1)

        for ae in assignment_earnings:
            assignment_earnings_total += (ae.amount or 0)

    computed_earnings_total = 0
    computed_items = []
    for e in doc.earnings:
        if e.amount and e.amount > 0:
            computed_items.append(e)
            computed_earnings_total += e.amount

    deductions_total = 0
    deduction_items = []
    for d in doc.deductions:
        component_details = frappe.db.get_value(
            "Salary Component",
            d.salary_component,
            ["employer_contribution", "deduct_from_cash_in_hand_only"],
            as_dict=1
        )
        if d.amount and d.amount > 0 and component_details and not component_details.employer_contribution and not component_details.deduct_from_cash_in_hand_only:
            deduction_items.append(d)
            deductions_total += d.amount

    max_rows = max(len(assignment_earnings), len(computed_items), len(deduction_items))

    earnings_deductions_rows = ""
    for i in range(max_rows):
        earnings_deductions_rows += "<tr>"

        if i < len(assignment_earnings):
            ae = assignment_earnings[i]
            earnings_deductions_rows += f"""
                <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px;">{ae.salary_component}</td>
                <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-size: 11px;">{fmt_money(ae.amount, currency=doc.currency)}</td>
            """
        else:
            earnings_deductions_rows += """
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
            """

        if i < len(computed_items):
            e = computed_items[i]
            earnings_deductions_rows += f"""
                <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px;">{e.salary_component}</td>
                <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-size: 11px;">{fmt_money(e.amount, currency=doc.currency)}</td>
            """
        else:
            earnings_deductions_rows += """
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
            """

        if i < len(deduction_items):
            d = deduction_items[i]
            earnings_deductions_rows += f"""
                <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px;">{d.salary_component}</td>
                <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-size: 11px;">{fmt_money(d.amount, currency=doc.currency)}</td>
            """
        else:
            earnings_deductions_rows += """
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
                <td style="padding: 6px; border: 1px solid #ddd;">&nbsp;</td>
            """

        earnings_deductions_rows += "</tr>"

    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: Arial, sans-serif;
            font-size: 11px;
        }}
        .container {{
            border: 2px solid #000;
            padding: 15px;
            max-width: 100%;
        }}
        .header {{
            text-align: center;
            margin-bottom: 10px;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
        }}
        .header h2 {{
            font-size: 16px;
            margin-bottom: 5px;
        }}
        .header p {{
            font-size: 11px;
            margin: 2px 0;
        }}
        .payslip-title {{
            background-color: #f2f2f2;
            text-align: center;
            padding: 8px;
            margin-bottom: 10px;
            border: 1px solid #ccc;
        }}
        .payslip-title h3 {{
            font-size: 14px;
            margin: 0;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        .summary-table {{
            margin-bottom: 10px;
        }}
        .summary-table th {{
            background-color: #e8e8e8;
            padding: 6px;
            text-align: left;
            border: 1px solid #ccc;
            font-size: 12px;
        }}
        .summary-table td {{
            padding: 5px 8px;
            border: 1px solid #ddd;
            font-size: 11px;
        }}
        .summary-table .label {{
            font-weight: 600;
            background-color: #f5f5f5;
            width: 16%;
        }}
        .summary-table .value {{
            width: 17%;
        }}
        .earnings-table {{
            margin-bottom: 10px;
        }}
        .earnings-table th {{
            background-color: #f8f8f8;
            padding: 8px;
            border: 2px solid #000;
            font-size: 12px;
            font-weight: bold;
            text-align: center;
        }}
        .earnings-table .total-row {{
            background-color: #e8f4f8;
            font-weight: bold;
        }}
        .net-payable {{
            background-color: #f9f9f9;
            padding: 10px;
            text-align: center;
            border: 2px solid #000;
            margin-top: 10px;
        }}
        .net-payable .amount {{
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 3px;
        }}
        .net-payable .words {{
            font-size: 11px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2><strong>{doc.company}</strong></h2>
            <p>
    """

    if company_address:
        html += f"<strong>Address:</strong> {company_address}"
    else:
        html += """<strong>Head Office Address:</strong> Bajaj Steel Industries Limited, C-108, M.I.D.C. Industrial Area, Hingna Road, Nagpur, Maharashtra - 440016"""

    html += f"""
            </p>
        </div>
        <div class="payslip-title">
            <h3>Payslip for the Month of {formatdate(doc.start_date, "MMMM yyyy")}</h3>
        </div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th colspan="6">Employee Pay Summary</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="label">Employee Name</td>
                    <td class="value">{doc.employee_name}</td>
                    <td class="label">Gender</td>
                    <td class="value">{employee_details.get('gender') or '-'}</td>
                    <td class="label">Date of Joining</td>
                    <td class="value">{formatdate(doj, "dd-MM-yyyy") if doj else '-'}</td>
                </tr>
                <tr>
                    <td class="label">Designation</td>
                    <td class="value">{designation or '-'}</td>
                    <td class="label">Department</td>
                    <td class="value">{department or '-'}</td>
                    <td class="label">Branch</td>
                    <td class="value">{branch or '-'}</td>
                </tr>
                <tr>
                    <td class="label">Category</td>
                    <td class="value">{category or '-'}</td>
                    <td class="label">Division</td>
                    <td class="value">{division or '-'}</td>
                    <td class="label">Payment Days</td>
                    <td class="value">{doc.payment_days or 0}</td>
                </tr>
                <tr>
                    <td class="label">PF Account No</td>
                    <td class="value">{employee_details.get('employee_pf_account') or '-'}</td>
                    <td class="label">ESI Number</td>
                    <td class="value">{employee_details.get('esic_number') or '-'}</td>
                    <td class="label">LIN Number</td>
                    <td class="value">{employee_details.get('lin_number') or '-'}</td>
                </tr>
                <tr>
                    <td class="label">Bank Name</td>
                    <td class="value">{employee_details.get('bank_name') or '-'}</td>
                    <td class="label">Account Number</td>
                    <td class="value">{employee_details.get('account_number') or '-'}</td>
                    <td class="label">IFSC Code</td>
                    <td class="value">{employee_details.get('ifsc_code') or '-'}</td>
                </tr>
                <tr>
                    <td class="label">Working Days</td>
                    <td class="value">{doc.total_working_days or 0}</td>
                    <td class="label">Present Days</td>
                    <td class="value">{present_days}</td>
                    <td class="label">Absent Days</td>
                    <td class="value">{doc.absent_days or 0}</td>
                </tr>
            </tbody>
        </table>
        <table class="earnings-table">
            <thead>
                <tr>
                    <th colspan="2">Earnings</th>
                    <th colspan="2">Computed Earnings</th>
                    <th colspan="2">Deductions</th>
                </tr>
                <tr>
                    <th style="width: 16.66%; text-align: left; font-size: 10px; font-weight: normal;">Component</th>
                    <th style="width: 16.66%; text-align: right; font-size: 10px; font-weight: normal;">Amount</th>
                    <th style="width: 16.66%; text-align: left; font-size: 10px; font-weight: normal;">Component</th>
                    <th style="width: 16.66%; text-align: right; font-size: 10px; font-weight: normal;">Amount</th>
                    <th style="width: 16.66%; text-align: left; font-size: 10px; font-weight: normal;">Component</th>
                    <th style="width: 16.66%; text-align: right; font-size: 10px; font-weight: normal;">Amount</th>
                </tr>
            </thead>
            <tbody>
                {earnings_deductions_rows}
                <tr class="total-row">
                    <td style="padding: 8px; border: 1px solid #000; font-size: 12px;">Total</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 12px;">{fmt_money(assignment_earnings_total, currency=doc.currency)}</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 12px;">Total</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 12px;">{fmt_money(computed_earnings_total, currency=doc.currency)}</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 12px;">Total</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 12px;">{fmt_money(deductions_total, currency=doc.currency)}</td>
                </tr>
            </tbody>
        </table>
        <div class="net-payable">
            <div class="amount">Total Net Payable: {fmt_money(flt(doc.net_salary, 2), currency=doc.currency)}</div>
            <div class="words">({money_in_words(flt(doc.net_salary, 2), doc.currency)})</div>
        </div>
    </div>
</body>
</html>
    """

    return html