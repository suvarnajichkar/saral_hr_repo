import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day


class SalarySlip(Document):
    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


def get_salary_component_abbr(salary_component):
    return frappe.db.get_value(
        "Salary Component",
        salary_component,
        "salary_component_abbr"
    ) or ""


@frappe.whitelist()
def get_salary_structure_for_employee(employee):
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

    for row in ssa_doc.earnings or []:
        earnings.append({
            "salary_component": row.salary_component,
            "abbr": get_salary_component_abbr(row.salary_component),
            "amount": row.amount
        })

    for row in ssa_doc.deductions or []:
        employer_contribution = frappe.db.get_value(
            "Salary Component",
            row.salary_component,
            "employer_contribution"
        ) or 0

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": get_salary_component_abbr(row.salary_component),
            "amount": row.amount,
            "employer_contribution": employer_contribution
        })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


@frappe.whitelist()
def get_attendance_summary(employee, start_date):
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)

    present_days = frappe.db.count(
        "Attendance",
        {
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": ["in", ["Present", "Work From Home", "On Leave"]],
            "docstatus": ["!=", 2]
        }
    )

    absent_days = frappe.db.count(
        "Attendance",
        {
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
