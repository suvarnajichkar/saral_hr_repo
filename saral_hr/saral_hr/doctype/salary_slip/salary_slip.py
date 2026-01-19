import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day

class SalarySlip(Document):
    def validate(self):
        # Automatically set end_date to last day of start_date's month
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


# ===============================
# HELPER: GET ABBREVIATION SAFELY
# ===============================
def get_salary_component_abbr(salary_component):
    """Fetch abbreviation from Salary Component, checking multiple possible field names"""
    if not salary_component:
        return ""
    
    # Try different possible field names for abbreviation
    possible_fields = ['abbr', 'abbreviation', 'component_abbr', 'short_name', 'salary_component_abbr']
    
    for field in possible_fields:
        try:
            value = frappe.db.get_value("Salary Component", salary_component, field)
            if value:
                return value
        except:
            continue
    
    # If no abbreviation field found, return empty string
    return ""


# ===============================
# FETCH SALARY STRUCTURE FOR EMPLOYEE
# ===============================
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
        abbr = get_salary_component_abbr(row.salary_component)
        earnings.append({
            "salary_component": row.salary_component,
            "abbr": abbr,
            "amount": row.amount
        })

    for row in ssa_doc.deductions or []:
        abbr = get_salary_component_abbr(row.salary_component)
        deductions.append({
            "salary_component": row.salary_component,
            "abbr": abbr,
            "amount": row.amount
        })

    # If both earnings and deductions are empty, fetch from Salary Structure
    if not earnings and not deductions:
        ss_doc = frappe.get_doc("Salary Structure", ssa_doc.salary_structure)
        for row in ss_doc.earnings:
            abbr = get_salary_component_abbr(row.salary_component)
            earnings.append({
                "salary_component": row.salary_component,
                "abbr": abbr,
                "amount": row.amount
            })
        for row in ss_doc.deductions:
            abbr = get_salary_component_abbr(row.salary_component)
            deductions.append({
                "salary_component": row.salary_component,
                "abbr": abbr,
                "amount": row.amount
            })

    return {
        "salary_structure": ssa_doc.salary_structure,
        "currency": "INR",
        "earnings": earnings,
        "deductions": deductions
    }


# ===============================
# FETCH ATTENDANCE SUMMARY
# ===============================
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