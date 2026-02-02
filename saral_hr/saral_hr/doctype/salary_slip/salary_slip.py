import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day
import calendar
from datetime import timedelta


class SalarySlip(Document):
    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


@frappe.whitelist()
def get_salary_structure_for_employee(employee):
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

    for row in ssa_doc.earnings:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            ["salary_component_abbr", "depends_on_payment_days"],
            as_dict=True
        )

        earnings.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": row.amount,
            "depends_on_payment_days": comp.depends_on_payment_days
        })

    for row in ssa_doc.deductions:
        comp = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            [
                "salary_component_abbr",
                "employer_contribution",
                "depends_on_payment_days",
                "deduct_from_cash_in_hand_only"
            ],
            as_dict=True
        )

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": row.amount,
            "employer_contribution": comp.employer_contribution,
            "depends_on_payment_days": comp.depends_on_payment_days,
            "deduct_from_cash_in_hand_only": comp.deduct_from_cash_in_hand_only
        })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


@frappe.whitelist()
def get_attendance_and_days(employee, start_date, working_days_calculation_method="Exclude Weekly Offs"):
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)

    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")
    total_days = calendar.monthrange(start_date.year, start_date.month)[1]

    # Weekly offs
    weekly_off_count = 0
    day_map = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2,
        "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6
    }

    if weekly_off:
        off_day = day_map.get(weekly_off)
        current = start_date
        while current <= end_date:
            if current.weekday() == off_day:
                weekly_off_count += 1
            current += timedelta(days=1)

    # Attendance records
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

    for a in attendance:
        if a.status in ["Present", "On Leave"]:
            present_days += 1
        elif a.status == "Half Day":
            present_days += 0.5
            absent_days += 0.5
        elif a.status == "Absent":
            absent_days += 1

    # Calculate working days based on the method
    if working_days_calculation_method == "Include Weekly Offs":
        # Working days = Total days in month (no deduction for weekly offs)
        working_days = total_days
    else:  # "Exclude Weekly Offs"
        # Working days = Total days - Weekly offs
        working_days = total_days - weekly_off_count

    payment_days = working_days - absent_days

    return {
        "total_days": total_days,
        "weekly_offs": weekly_off_count,
        "working_days": working_days,
        "payment_days": payment_days,
        "present_days": present_days,
        "absent_days": absent_days
    }


@frappe.whitelist()
def get_variable_pay_percentage(division, start_date):
    """
    Fetch Variable Pay percentage for a given division and month/year
    """
    if not division or not start_date:
        return {"percentage": 0}
    
    start_date = getdate(start_date)
    month_name = start_date.strftime("%B")  # e.g., "December"
    year = str(start_date.year)  # e.g., "2025"
    
    # Find the Variable Pay Assignment document for this month and year
    vpa_name = f"{year} - {month_name}"
    
    try:
        vpa_doc = frappe.get_doc("Variable Pay Assignment", vpa_name)
        
        # Search for the division in the child table
        for row in vpa_doc.variable_pay:
            if row.division == division:
                return {
                    "percentage": row.percentage or 0,
                    "found": True
                }
        
        # Division not found in the assignment
        return {
            "percentage": 0,
            "found": False,
            "message": f"No variable pay percentage found for division '{division}' in {month_name} {year}"
        }
        
    except frappe.DoesNotExistError:
        return {
            "percentage": 0,
            "found": False,
            "message": f"No Variable Pay Assignment found for {month_name} {year}"
        }