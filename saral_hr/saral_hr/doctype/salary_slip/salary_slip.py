import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day
import calendar
from datetime import timedelta


class SalarySlip(Document):

    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


# ------------------------------------------------------
# Get Active Employees Only
# ------------------------------------------------------
@frappe.whitelist()
def get_active_employees():
    """
    Filter to show only active employees in the employee field
    """
    return {
        "filters": {
            "status": "Active"
        }
    }


# ------------------------------------------------------
# Fetch Salary Structure Assignment
# ------------------------------------------------------
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
            ["salary_component_abbr", "employer_contribution", "depends_on_payment_days"],
            as_dict=True
        )

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": row.amount,
            "employer_contribution": comp.employer_contribution,
            "depends_on_payment_days": comp.depends_on_payment_days
        })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


# ------------------------------------------------------
# Attendance + Weekly Off Calculation
# ------------------------------------------------------
@frappe.whitelist()
def get_attendance_and_days(employee, start_date, deduct_weekly_off=1):
    """
    Calculate attendance and working days for salary slip.
    
    Args:
        employee: Employee ID
        start_date: Start date of salary period
        deduct_weekly_off: 1 to deduct weekly offs from working days, 0 to not deduct
    
    Returns:
        Dictionary containing day calculations
    """
    
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)
    
    # Convert deduct_weekly_off to integer if string
    deduct_weekly_off = int(deduct_weekly_off) if isinstance(deduct_weekly_off, str) else deduct_weekly_off

    # Get weekly off day from employee's company
    weekly_off = frappe.db.get_value(
        "Company Link",
        employee,
        "weekly_off"
    )

    # Total days in the month
    total_days = calendar.monthrange(start_date.year, start_date.month)[1]
    weekly_off_count = 0

    day_map = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2,
        "Thursday": 3, "Friday": 4,
        "Saturday": 5, "Sunday": 6
    }

    # Count weekly offs in the month
    if weekly_off:
        off_day = day_map.get(weekly_off)
        current = start_date

        while current <= end_date:
            if current.weekday() == off_day:
                weekly_off_count += 1
            current += timedelta(days=1)

    # Get present days (Present + WFH + On Leave)
    present_days = frappe.db.count(
        "Attendance",
        {
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": ["in", ["Present", "Work From Home", "On Leave"]],
            "docstatus": ["!=", 2]
        }
    )

    # Get absent days
    absent_days = frappe.db.count(
        "Attendance",
        {
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": "Absent",
            "docstatus": ["!=", 2]
        }
    )

    # Calculate working days based on deduct_weekly_off setting
    if deduct_weekly_off:
        # Deduct weekly offs from total days
        working_days = total_days - weekly_off_count
        payment_days = working_days - absent_days
    else:
        # Do not deduct weekly offs - working days = total days
        working_days = total_days
        payment_days = total_days - absent_days

    return {
        "total_days": total_days,
        "weekly_offs": weekly_off_count,
        "working_days": working_days,
        "payment_days": payment_days,
        "present_days": present_days,
        "absent_days": absent_days
    }