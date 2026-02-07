import frappe
from frappe.model.document import Document
from frappe.utils import getdate, get_last_day, flt
import calendar
from datetime import timedelta
from dateutil.relativedelta import relativedelta


class SalarySlip(Document):
    def validate(self):
        if self.start_date:
            self.end_date = get_last_day(getdate(self.start_date))


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

    # Track which components we've already added from salary structure
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
        
        # Get amount based on whether it's a special component
        amount = row.amount
        if comp.is_special_component and current_month:
            special_amount = get_special_component_amount(row.salary_component, current_month)
            if special_amount is not None:
                amount = special_amount
            else:
                # Special component but no amount for this month - skip it
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
        
        # Get amount based on whether it's a special component
        amount = row.amount
        if comp.is_special_component and current_month:
            special_amount = get_special_component_amount(row.salary_component, current_month)
            if special_amount is not None:
                amount = special_amount
            else:
                # Special component but no amount for this month - skip it
                continue

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
        # Get all special components
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
            # Check if this component has an amount for current month
            special_amount = get_special_component_amount(comp.name, current_month)
            
            if special_amount is not None and special_amount > 0:
                # Add to earnings if not already added
                if comp.type == "Earning" and comp.name not in added_earnings:
                    earnings.append({
                        "salary_component": comp.name,
                        "abbr": comp.salary_component_abbr,
                        "amount": special_amount,
                        "depends_on_payment_days": comp.depends_on_payment_days,
                        "is_special_component": 1,
                        "is_part_of_pf_wages": comp.is_part_of_pf_wages
                    })
                
                # Add to deductions if not already added
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
    Get the amount for a special component for a specific month
    Returns None if month not found or amount is 0 or negative
    Returns the amount if it's greater than 0
    """
    component_doc = frappe.get_doc("Salary Component", component_name)
    
    if not component_doc.is_special_component:
        return None
    
    for row in component_doc.enter_amount_according_to_months:
        if row.month == month:
            amount = flt(row.amount)
            # Return None if amount is 0 or negative (skip this component for this month)
            return amount if amount > 0 else None
    
    # If month not found in table, return None (skip this component)
    return None


@frappe.whitelist()
def get_variable_pay_percentage(employee, start_date):
    """
    Get variable pay percentage for employee's division for given month/year
    Returns: percentage value (0-100) or None
    """
    if not employee or not start_date:
        return None
    
    # Get employee's division
    division = frappe.db.get_value("Company Link", employee, "division")
    if not division:
        return None
    
    # Parse start_date to get year and month
    date_obj = getdate(start_date)
    year = str(date_obj.year)
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    month = month_names[date_obj.month - 1]
    
    # Find Variable Pay Assignment for this year and month
    vpa_name = f"{year} - {month}"
    
    if not frappe.db.exists("Variable Pay Assignment", vpa_name):
        return None
    
    vpa_doc = frappe.get_doc("Variable Pay Assignment", vpa_name)
    
    # Find the division's percentage
    for row in vpa_doc.variable_pay:
        if row.division == division:
            return flt(row.percentage)
    
    return None


@frappe.whitelist()
def get_attendance_and_days(employee, start_date, working_days_calculation_method=None):
    """
    Calculate working days, payment days, and attendance
    FIXED: Proper handling of half days in payment_days calculation
    """
    start_date = getdate(start_date)
    end_date = get_last_day(start_date)

    # Get calculation method from employee's company if not provided
    if not working_days_calculation_method:
        working_days_calculation_method = frappe.db.get_value(
            "Company Link", 
            employee, 
            "salary_calculation_based_on"
        )
    
    # Map the company setting to the expected format
    # Company setting: "Working days in a month" or "No. of days in a month"
    # Expected format: "Exclude Weekly Offs" or "Include Weekly Offs"
    if working_days_calculation_method == "No. of days in a month":
        calculation_method = "Include Weekly Offs"
    else:
        calculation_method = "Exclude Weekly Offs"

    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")
    total_days = calendar.monthrange(start_date.year, start_date.month)[1]

    # Calculate weekly offs
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

    # Get attendance records
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
            present_days += 0.5  # Add 0.5 to present
            absent_days += 0.5   # Add 0.5 to absent
        elif a.status == "Absent":
            absent_days += 1

    # Calculate total half days for display (count, not decimal)
    total_half_days = flt(half_day_count * 0.5, 2)

    # Calculate working days and payment days based on method
    if calculation_method == "Include Weekly Offs":
        working_days = total_days
        # FIXED: Payment days should include half days properly
        payment_days = flt(total_days - absent_days, 2)
    else:  # "Exclude Weekly Offs"
        working_days = total_days - weekly_off_count
        # FIXED: Payment days should include half days properly
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