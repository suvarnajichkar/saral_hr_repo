import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today, get_first_day, get_last_day


class SalarySlip(Document):
    pass


@frappe.whitelist()
def get_salary_structure_for_employee(employee, posting_date=None):
    if not posting_date:
        posting_date = today()

    posting_date = getdate(posting_date)

    # Get active Salary Structure Assignment
    ssa = frappe.db.get_all(
        "Salary Structure Assignment",
        filters={
            "employee": employee,
            "from_date": ("<=", posting_date)
        },
        fields=["name", "salary_structure"],
        order_by="from_date desc",
        limit=1
    )

    if not ssa:
        return None

    ssa_doc = frappe.get_doc("Salary Structure Assignment", ssa[0].name)

    earnings = []
    deductions = []

    # Prefer SSA values
    if ssa_doc.earnings:
        for row in ssa_doc.earnings:
            earnings.append({
                "salary_component": row.salary_component,
                "amount": row.amount
            })

    if ssa_doc.deductions:
        for row in ssa_doc.deductions:
            deductions.append({
                "salary_component": row.salary_component,
                "amount": row.amount
            })

    # Fallback → Salary Structure
    if not earnings and not deductions:
        ss_doc = frappe.get_doc("Salary Structure", ssa_doc.salary_structure)

        for row in ss_doc.earnings:
            earnings.append({
                "salary_component": row.salary_component,
                "amount": row.amount
            })

        for row in ss_doc.deductions:
            deductions.append({
                "salary_component": row.salary_component,
                "amount": row.amount
            })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


@frappe.whitelist()
def get_attendance_summary(employee, posting_date=None):
    """
    Fetch attendance summary for the employee for the month of posting_date
    Returns present_days and absent_days counts
    """
    if not posting_date:
        posting_date = today()

    posting_date = getdate(posting_date)
    
    # Get first and last day of the month
    start_date = get_first_day(posting_date)
    end_date = get_last_day(posting_date)

    # Count Present days
    present_days = frappe.db.count(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": "Present",
            "docstatus": ["!=", 2]  # Exclude cancelled records
        }
    )

    # Count Absent days
    absent_days = frappe.db.count(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": "Absent",
            "docstatus": ["!=", 2]  # Exclude cancelled records
        }
    )

    return {
        "present_days": present_days,
        "absent_days": absent_days
    }