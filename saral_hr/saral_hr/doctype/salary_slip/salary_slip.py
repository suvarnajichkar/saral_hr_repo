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
import re


class SalarySlip(Document):
    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


def is_professional_tax(component_name):
    """
    Check if component name matches Professional Tax pattern.
    Handles variations like: PT, P.T, P T, Professional Tax, Prof Tax, Profess Tax, etc.
    
    Args:
        component_name: The salary component name to check
        
    Returns:
        bool: True if it matches PT pattern, False otherwise
    """
    if not component_name:
        return False
    
    # Normalize: lowercase, remove extra spaces, dots, underscores, hyphens
    normalized = re.sub(r'[.\s_-]+', ' ', component_name.lower()).strip()
    
    # Pattern matches:
    # - "pt" or "p t"
    # - "professional tax" or "professionaltax"
    # - "prof tax" or "proftax"
    # - "profess tax" or "professtax"
    # - Any variation with spaces/dots/underscores/hyphens
    patterns = [
        r'^p\s*t$',                          # PT, P T, P.T, etc.
        r'^professional\s*tax$',             # Professional Tax
        r'^prof\s*tax$',                     # Prof Tax
        r'^profess\s*tax$',                  # Profess Tax
        r'^profession\s*tax$',               # Profession Tax
        r'^prof\s*t$',                       # Prof T
        r'^profess\s*t$'                     # Profess T
    ]
    
    return any(re.match(pattern, normalized) for pattern in patterns)


def apply_professional_tax_february_rule(component_name, base_amount, start_date):
    """
    Hardcoded rule for Professional Tax:
      - Only activates when component name matches Professional Tax pattern
      - Only activates when the SSA base_amount > 0 (employee has PT in their structure)
      - If the salary slip month is February -> override final amount to 300
      - All other months -> return base_amount unchanged
      - If SSA amount is 0 -> return 0 unchanged (rule does not apply)
    """
    if not is_professional_tax(component_name):
        return base_amount

    # Rule only kicks in when SSA has a non-zero PT amount
    if flt(base_amount) <= 0:
        return base_amount

    # Force 300 for February
    if start_date:
        date_obj = getdate(start_date)
        if date_obj.month == 2:  # February
            return 300.0

    return base_amount


@frappe.whitelist()
def get_salary_structure_for_employee(employee, start_date=None):
    """
    Fetch salary structure for employee with special component handling
    Also includes special components not in salary structure if they have amount for current month
    """
    ssa = frappe.db.get_all(
        "Salary Structure Assignment",
        filters={"employee": employee},
        fields=["name"],
        order_by="from_date desc",
        limit=1
    )

    if not ssa:
        return None

    ssa_doc = frappe.get_doc("Salary Structure Assignment", ssa[0].name)

    earnings = []
    deductions = []
    
    # Get current month name for special component lookup
    current_month = None
    if start_date:
        start_date_obj = getdate(start_date)
        month_names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]
        current_month = month_names[start_date_obj.month - 1]

    # Track which components we have already added from salary structure
    added_earnings = set()
    added_deductions = set()

    # Process Earnings from Salary Structure
    for row in ssa_doc.earnings:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            [
                "salary_component_abbr",
                "depends_on_payment_days",
                "is_special_component",
                "type",
                "is_part_of_pf_wages"
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
            "is_special_component": comp.is_special_component,
            "is_part_of_pf_wages": comp.is_part_of_pf_wages
        })
        added_earnings.add(row.salary_component)

    # Process Deductions from Salary Structure
    for row in ssa_doc.deductions:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            [
                "salary_component_abbr",
                "employer_contribution",
                "depends_on_payment_days",
                "is_special_component",
                "type",
                "is_pf_component",
                "pf_percentage",
                "calculate_on_pf_wages"
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

        # Apply Professional Tax February hardcoded rule
        amount = apply_professional_tax_february_rule(row.salary_component, amount, start_date)

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": amount,
            "employer_contribution": comp.employer_contribution,
            "depends_on_payment_days": comp.depends_on_payment_days,
            "is_special_component": comp.is_special_component,
            "is_pf_component": comp.is_pf_component,
            "pf_percentage": comp.pf_percentage,
            "calculate_on_pf_wages": comp.calculate_on_pf_wages
        })
        added_deductions.add(row.salary_component)

    # Add special components NOT in salary structure but have amount for current month
    if current_month:
        all_special_components = frappe.get_all(
            "Salary Component",
            filters={"is_special_component": 1},
            fields=[
                "name",
                "salary_component_abbr",
                "type",
                "depends_on_payment_days",
                "employer_contribution",
                "is_part_of_pf_wages",
                "is_pf_component",
                "pf_percentage",
                "calculate_on_pf_wages"
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
                        "is_special_component": 1,
                        "is_part_of_pf_wages": comp.is_part_of_pf_wages
                    })
                
                elif comp.type == "Deduction" and comp.name not in added_deductions:
                    deductions.append({
                        "salary_component": comp.name,
                        "abbr": comp.salary_component_abbr,
                        "amount": special_amount,
                        "employer_contribution": comp.employer_contribution,
                        "depends_on_payment_days": comp.depends_on_payment_days,
                        "is_special_component": 1,
                        "is_pf_component": comp.is_pf_component,
                        "pf_percentage": comp.pf_percentage,
                        "calculate_on_pf_wages": comp.calculate_on_pf_wages
                    })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


def get_special_component_amount(component_name, month):
    """
    Get the amount for a special component for a specific month.
    Returns None if month not found or amount <= 0.
    """
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
    """
    Get variable pay percentage for employee's division for given month/year.
    Returns: percentage value (0-100) or None
    """
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
    """
    Calculate working days, payment days, and attendance.
    FIXED: Proper handling of half days in payment_days calculation.
    """
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

    for a in attendance:
        if a.status in ["Present", "On Leave"]:
            present_days += 1
        elif a.status == "Half Day":
            half_day_count += 1
            present_days += 0.5
            absent_days += 0.5
        elif a.status == "Absent":
            absent_days += 1

    total_half_days = flt(half_day_count * 0.5, 2)

    if calculation_method == "Include Weekly Offs":
        working_days = total_days
        payment_days = flt(total_days - absent_days, 2)
    else:
        working_days = total_days - weekly_off_count
        payment_days = flt(working_days - absent_days, 2)

    return {
        "total_days": total_days,
        "weekly_offs": weekly_off_count,
        "working_days": working_days,
        "payment_days": payment_days,
        "present_days": present_days,
        "absent_days": absent_days,
        "total_half_days": total_half_days,
        "calculation_method": calculation_method
    }

@frappe.whitelist()
def get_eligible_employees_for_salary_slip(year, month):
    """
    Get list of employees eligible for salary slip generation.
    Excludes employees who already have a salary slip for the period.
    Only includes employees with attendance > 0 for the month.
    """
    from datetime import datetime
    
    month_map = {
        "January": 1, "February": 2, "March": 3, "April": 4,
        "May": 5, "June": 6, "July": 7, "August": 8,
        "September": 9, "October": 10, "November": 11, "December": 12
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
            AND (
                (ssa.from_date <= %(start_date)s AND ssa.to_date IS NULL)
                OR (ssa.from_date <= %(start_date)s AND ssa.to_date >= %(start_date)s)
            )
    """, {"start_date": start_date}, as_dict=1)
    
    eligible_employees = []
    
    for emp in employees:
        existing_slip = frappe.db.exists("Salary Slip", {
            "employee": emp.name,
            "start_date": start_date
        })
        
        if existing_slip:
            continue
        
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
    Generate salary slips for multiple employees.
    """
    import json
    from datetime import datetime
    
    if isinstance(employees, str):
        employees = json.loads(employees)
    
    month_map = {
        "January": 1, "February": 2, "March": 3, "April": 4,
        "May": 5, "June": 6, "July": 7, "August": 8,
        "September": 9, "October": 10, "November": 11, "December": 12
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
            employee = emp_data.get("employee")
            
            salary_data = get_salary_structure_for_employee(employee, start_date)
            
            if not salary_data:
                errors.append(f"{emp_data.get('employee_name', employee)}: No salary structure found")
                failed_count += 1
                continue
            
            attendance_data = get_attendance_and_days(employee, start_date)
            
            if not attendance_data:
                errors.append(f"{emp_data.get('employee_name', employee)}: Could not fetch attendance")
                failed_count += 1
                continue
            
            variable_pay = get_variable_pay_percentage(employee, start_date) or 0
            
            salary_slip = frappe.new_doc("Salary Slip")
            salary_slip.employee = employee
            salary_slip.start_date = start_date
            salary_slip.end_date = get_last_day(getdate(start_date))
            salary_slip.currency = "INR"
            salary_slip.salary_structure = salary_data.get("salary_structure")
            
            salary_slip.total_working_days = attendance_data.get("working_days")
            salary_slip.payment_days = attendance_data.get("payment_days")
            salary_slip.present_days = attendance_data.get("present_days")
            salary_slip.absent_days = attendance_data.get("absent_days")
            salary_slip.weekly_offs_count = attendance_data.get("weekly_offs")
            salary_slip.total_half_days = attendance_data.get("total_half_days")
            
            for earning in salary_data.get("earnings", []):
                salary_slip.append("earnings", earning)
            
            for deduction in salary_data.get("deductions", []):
                salary_slip.append("deductions", deduction)
            
            calculate_salary_slip_amounts(salary_slip, variable_pay / 100 if variable_pay else 0)
            
            salary_slip.insert(ignore_permissions=True)
            success_count += 1
            
        except Exception as e:
            errors.append(f"{emp_data.get('employee_name', employee)}: {str(e)}")
            failed_count += 1
            frappe.log_error(f"Error generating salary slip for {employee}: {str(e)}", "Bulk Salary Slip Generation")
    
    frappe.db.commit()
    
    return {
        "success": success_count,
        "failed": failed_count,
        "errors": errors
    }


def calculate_salary_slip_amounts(salary_slip, variable_pay_percentage):
    """
    Calculate salary slip amounts (earnings, deductions, totals).
    Replicates the JS calculation logic in Python for bulk generation.
    """
    total_earnings = 0
    total_deductions = 0
    total_basic_da = 0
    total_employer_contribution = 0
    retention = 0
    
    wd = flt(salary_slip.total_working_days)
    pd = flt(salary_slip.payment_days)
    
    basic_amount = 0
    da_amount = 0
    conveyance_amount = 0
    
    # Calculate Earnings
    for row in salary_slip.earnings:
        base = flt(row.amount or 0)
        row.base_amount = base
        
        if row.salary_component and "variable" in row.salary_component.lower():
            if wd > 0 and row.depends_on_payment_days:
                row.amount = flt((base / wd) * pd * variable_pay_percentage, 2)
            else:
                row.amount = flt(base * variable_pay_percentage, 2)
        else:
            if row.depends_on_payment_days and wd > 0:
                row.amount = flt((base / wd) * pd, 2)
            else:
                row.amount = flt(base, 2)
        
        total_earnings += row.amount
        
        comp_lower = row.salary_component.lower()
        if "basic" in comp_lower:
            basic_amount = row.amount
        if "da" in comp_lower or "dearness" in comp_lower:
            da_amount = row.amount
        if "conveyance" in comp_lower:
            conveyance_amount = row.amount
    
    total_basic_da = basic_amount + da_amount
    
    # Calculate Deductions
    for row in salary_slip.deductions:
        base = flt(row.base_amount or row.amount or 0)
        row.base_amount = base
        comp_lower = row.salary_component.lower()

        # ===== PROFESSIONAL TAX - February hardcoded rule =====
        # get_salary_structure_for_employee already set the correct amount (300 or unchanged)
        # on the row.amount when it built the deductions list. However base_amount still holds
        # the SSA original value. We reapply the rule here to be safe during calculation.
        if is_professional_tax(row.salary_component):
            row.amount = flt(
                apply_professional_tax_february_rule(
                    row.salary_component, base, salary_slip.start_date
                ), 2
            )

        # ESIC Employee
        elif "esic" in comp_lower and "employer" not in comp_lower:
            if base > 0 and total_earnings < 21000:
                row.amount = flt((total_earnings - conveyance_amount) * 0.0075, 2)
            else:
                row.amount = 0
        
        # ESIC Employer
        elif "esic" in comp_lower and "employer" in comp_lower:
            if base > 0 and total_earnings < 21000:
                row.amount = flt((total_earnings - conveyance_amount) * 0.0325, 2)
            else:
                row.amount = 0
        
        # PF
        elif "pf" in comp_lower or "provident" in comp_lower:
            if base > 0:
                if pd == wd:
                    row.amount = flt(base, 2)
                else:
                    prorated_basic_da = basic_amount + da_amount
                    pf_wages = min(prorated_basic_da, 15000)
                    row.amount = flt(pf_wages * 0.12, 2)
            else:
                row.amount = 0
        
        # Other Deductions
        else:
            if row.depends_on_payment_days and wd > 0 and base > 0:
                row.amount = flt((base / wd) * pd, 2)
            else:
                row.amount = flt(base, 2)
        
        if row.employer_contribution:
            total_employer_contribution += row.amount
        else:
            total_deductions += row.amount
        
        if "retention" in comp_lower:
            retention += row.amount
    
    # Set totals
    salary_slip.total_earnings = flt(total_earnings, 2)
    salary_slip.total_deductions = flt(total_deductions, 2)
    salary_slip.net_salary = flt(total_earnings - total_deductions, 2)
    salary_slip.total_basic_da = flt(total_basic_da, 2)
    salary_slip.total_employer_contribution = flt(total_employer_contribution, 2)
    salary_slip.retention = flt(retention, 2)


@frappe.whitelist()
def get_submitted_salary_slips(year, month):
    """
    Get list of submitted salary slips for a given year and month.
    """
    month_map = {
        "January": 1, "February": 2, "March": 3, "April": 4,
        "May": 5, "June": 6, "July": 7, "August": 8,
        "September": 9, "October": 10, "November": 11, "December": 12
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
        ORDER BY
            ss.employee_name
    """, {"start_date": start_date}, as_dict=1)
    
    return salary_slips


@frappe.whitelist()
def bulk_print_salary_slips(salary_slip_names):
    """
    Generate a combined PDF for multiple salary slips using A4 Portrait format with TABLE LAYOUT.
    """
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
    """
    Generate HTML for salary slip using TABLE-BASED LAYOUT for better PDF rendering.
    """
    from frappe.utils import fmt_money, formatdate, money_in_words
    
    company_address = frappe.db.get_value("Company", doc.company, "address") if doc.company else ""
    
    company_link_details = frappe.db.get_value(
        "Company Link",
        doc.employee,
        ["employee", "date_of_joining", "designation", "department", "branch", "category", "division"],
        as_dict=1
    ) if doc.employee else {}
    
    doj = company_link_details.get("date_of_joining") if company_link_details else None
    employee_link = company_link_details.get("employee") if company_link_details else None
    designation = company_link_details.get("designation") if company_link_details else None
    department = company_link_details.get("department") if company_link_details else None
    branch = company_link_details.get("branch") if company_link_details else None
    category = company_link_details.get("category") if company_link_details else None
    division = company_link_details.get("division") if company_link_details else None
    
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
            ["employer_contribution"],
            as_dict=1
        )
        if d.amount and d.amount > 0 and component_details and not component_details.employer_contribution:
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
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: Arial, sans-serif; font-size: 11px; }}
        .container {{ border: 2px solid #000; padding: 15px; max-width: 100%; }}
        .header {{ text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }}
        .header h2 {{ font-size: 16px; margin-bottom: 5px; }}
        .header p {{ font-size: 11px; margin: 2px 0; }}
        .payslip-title {{ background-color: #f2f2f2; text-align: center; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; }}
        .payslip-title h3 {{ font-size: 14px; margin: 0; }}
        table {{ width: 100%; border-collapse: collapse; }}
        .summary-table {{ margin-bottom: 10px; }}
        .summary-table th {{ background-color: #e8e8e8; padding: 6px; text-align: left; border: 1px solid #ccc; font-size: 12px; }}
        .summary-table td {{ padding: 5px 8px; border: 1px solid #ddd; font-size: 11px; }}
        .summary-table .label {{ font-weight: 600; background-color: #f5f5f5; width: 16%; }}
        .summary-table .value {{ width: 17%; }}
        .earnings-table {{ margin-bottom: 10px; }}
        .earnings-table th {{ background-color: #f8f8f8; padding: 8px; border: 2px solid #000; font-size: 12px; font-weight: bold; text-align: center; }}
        .earnings-table .total-row {{ background-color: #e8f4f8; font-weight: bold; }}
        .net-payable {{ background-color: #f9f9f9; padding: 10px; text-align: center; border: 2px solid #000; margin-top: 10px; }}
        .net-payable .amount {{ font-size: 14px; font-weight: bold; margin-bottom: 3px; }}
        .net-payable .words {{ font-size: 11px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2><strong>{doc.company}</strong></h2>
            <p>"""
    
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
                <tr><th colspan="6">Employee Pay Summary</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td class="label">Employee Name</td><td class="value">{doc.employee_name}</td>
                    <td class="label">Gender</td><td class="value">{employee_details.get("gender") or "-"}</td>
                    <td class="label">Date of Joining</td><td class="value">{formatdate(doj, "dd-MM-yyyy") if doj else "-"}</td>
                </tr>
                <tr>
                    <td class="label">Designation</td><td class="value">{designation or "-"}</td>
                    <td class="label">Department</td><td class="value">{department or "-"}</td>
                    <td class="label">Branch</td><td class="value">{branch or "-"}</td>
                </tr>
                <tr>
                    <td class="label">Category</td><td class="value">{category or "-"}</td>
                    <td class="label">Division</td><td class="value">{division or "-"}</td>
                    <td class="label">Payment Days</td><td class="value">{doc.payment_days or 0}</td>
                </tr>
                <tr>
                    <td class="label">PF Account No</td><td class="value">{employee_details.get("employee_pf_account") or "-"}</td>
                    <td class="label">ESI Number</td><td class="value">{employee_details.get("esic_number") or "-"}</td>
                    <td class="label">LIN Number</td><td class="value">{employee_details.get("lin_number") or "-"}</td>
                </tr>
                <tr>
                    <td class="label">Bank Name</td><td class="value">{employee_details.get("bank_name") or "-"}</td>
                    <td class="label">Account Number</td><td class="value">{employee_details.get("account_number") or "-"}</td>
                    <td class="label">IFSC Code</td><td class="value">{employee_details.get("ifsc_code") or "-"}</td>
                </tr>
                <tr>
                    <td class="label">Working Days</td><td class="value">{doc.total_working_days or 0}</td>
                    <td class="label">Present Days</td><td class="value">{present_days}</td>
                    <td class="label">Absent Days</td><td class="value">{doc.absent_days or 0}</td>
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