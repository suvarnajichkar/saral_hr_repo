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
def get_salary_structure_for_employee(employee, start_date=None):
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
                "deduct_from_cash_in_hand_only",
                "is_labour_welfare_fund"
            ],
            as_dict=True
        )

        # Skip LWF components from salary structure
        # They will be added conditionally based on month
        if comp.is_labour_welfare_fund:
            continue

        deductions.append({
            "salary_component": row.salary_component,
            "abbr": comp.salary_component_abbr,
            "amount": row.amount,
            "employer_contribution": comp.employer_contribution,
            "depends_on_payment_days": comp.depends_on_payment_days,
            "deduct_from_cash_in_hand_only": comp.deduct_from_cash_in_hand_only
        })

    # Add Labour Welfare Fund components for June and December only
    if start_date:
        start_date_obj = getdate(start_date)
        month = start_date_obj.month
        
        # Check if month is June (6) or December (12)
        if month in [6, 12]:
            # Get all LWF components
            lwf_components = frappe.db.get_all(
                "Salary Component",
                filters={
                    "is_labour_welfare_fund": 1,
                    "type": "Deduction"
                },
                fields=[
                    "name",
                    "salary_component_abbr",
                    "employer_contribution"
                ]
            )
            
            for lwf in lwf_components:
                # Determine amount based on employer/employee
                if lwf.employer_contribution:
                    amount = 75  # Employer LWF
                else:
                    amount = 25  # Employee LWF
                
                deductions.append({
                    "salary_component": lwf.name,
                    "abbr": lwf.salary_component_abbr,
                    "amount": amount,
                    "employer_contribution": lwf.employer_contribution,
                    "depends_on_payment_days": 0,
                    "deduct_from_cash_in_hand_only": 0
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
        working_days = total_days
    else:  # "Exclude Weekly Offs"
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