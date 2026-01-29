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
def get_active_employees():
    return {
        "filters": {
            "is_active": 1
        }
    }


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

@frappe.whitelist()
def get_attendance_and_days(employee, start_date, deduct_weekly_off=1):
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)
    deduct_weekly_off = int(deduct_weekly_off) if isinstance(deduct_weekly_off, str) else deduct_weekly_off
    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")
    total_days = calendar.monthrange(start_date.year, start_date.month)[1]
    weekly_off_count = 0
    day_map = {"Monday":0,"Tuesday":1,"Wednesday":2,"Thursday":3,"Friday":4,"Saturday":5,"Sunday":6}
    if weekly_off:
        off_day = day_map.get(weekly_off)
        current = start_date
        while current <= end_date:
            if current.weekday() == off_day:
                weekly_off_count += 1
            current += timedelta(days=1)
    present_days = frappe.db.count(
        "Attendance",
        {
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]],
            "status": ["in", ["Present","Work From Home","On Leave"]],
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
    if deduct_weekly_off:
        working_days = total_days - weekly_off_count
        payment_days = working_days - absent_days
    else:
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
