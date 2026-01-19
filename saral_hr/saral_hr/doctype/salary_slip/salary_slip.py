import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day


class SalarySlip(Document):
    def validate(self):
        # Automatically set end_date to last day of start_date's month
        if self.start_date:
            start = getdate(self.start_date)
            self.end_date = get_last_day(start)


@frappe.whitelist()
def get_salary_structure_for_employee(employee):
    """
    Fetch the latest Salary Structure Assignment and return earnings/deductions
    """
    # Get active Salary Structure Assignment
    ssa = frappe.db.get_all(
        "Salary Structure Assignment",
        filters={"employee": employee},
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
def get_attendance_summary(employee, start_date):
    """
    Fetch attendance summary for the employee between start_date and end_date
    Returns present_days and absent_days counts only
    """
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)

    # Count Present days (including Work From Home and On Leave as working days)
    present_days = frappe.db.count(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": ["in", ["Present", "Work From Home", "On Leave"]],
            "docstatus": ["!=", 2]
        }
    )

    # Count Absent days
    absent_days = frappe.db.count(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": "Absent",
            "docstatus": ["!=", 2]
        }
    )

    return {
        "present_days": present_days,
        "absent_days": absent_days
    }