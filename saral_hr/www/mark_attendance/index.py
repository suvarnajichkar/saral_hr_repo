import frappe
from frappe.utils import getdate

@frappe.whitelist()
def get_active_employees():
    user = frappe.session.user

    # get company restrictions (if any)
    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    filters = {"is_active": 1}

    # apply company filter ONLY if restriction exists
    if companies:
        filters["company"] = ["in", companies]

    employees = frappe.get_all(
        "Company Link",
        filters=filters,
        fields=["name", "employee", "full_name", "company", "weekly_off"],
        order_by="full_name asc"
    )

    # Fetch Aadhaar numbers
    for emp in employees:
        aadhaar = frappe.db.get_value("Employee", emp.employee, "aadhar_number")
        emp["aadhaar_number"] = aadhaar or ""

    return employees


@frappe.whitelist()
def get_attendance_between_dates(employee, start_date, end_date):
    start_date = getdate(start_date)
    end_date = getdate(end_date)

    frappe.logger().info(f"Fetching attendance for {employee} from {start_date} to {end_date}")

    attendance_records = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]]
        },
        fields=["attendance_date", "status"]
    )

    frappe.logger().info(f"Found {len(attendance_records)} records")
    
    result = {}
    for row in attendance_records:
        date_str = str(row.attendance_date)
        result[date_str] = row.status
        
    frappe.logger().info(f"Returning data: {result}")
    
    return result


@frappe.whitelist()
def save_attendance(employee, attendance_date, status):
    """
    Save attendance - now supports Holiday status
    """
    user = frappe.session.user
    attendance_date = getdate(attendance_date)
    
    frappe.logger().info(f"=== SAVE ATTENDANCE ===")
    frappe.logger().info(f"Employee: {employee}")
    frappe.logger().info(f"Date: {attendance_date}")
    frappe.logger().info(f"Status: {status}")

    # Company restriction check
    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    if companies:
        allowed = frappe.db.exists(
            "Company Link",
            {
                "employee": employee,
                "company": ["in", companies]
            }
        )

        if not allowed:
            frappe.throw("Not permitted to mark attendance for this employee")

    # Check for existing attendance
    existing_attendance = frappe.db.get_value(
        "Attendance",
        {"employee": employee, "attendance_date": attendance_date},
        "name"
    )

    if existing_attendance:
        frappe.logger().info(f"Updating existing attendance: {existing_attendance}")
        doc = frappe.get_doc("Attendance", existing_attendance)
        doc.status = status
        doc.flags.ignore_validate = True
        doc.save(ignore_permissions=True)
    else:
        frappe.logger().info(f"Creating new attendance record")
        doc = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee,
            "attendance_date": attendance_date,
            "status": status
        })
        doc.flags.ignore_validate = True
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    frappe.logger().info(f"✓ Attendance saved successfully")
    return "success"


@frappe.whitelist()
def get_holidays_between_dates(company, start_date, end_date):
    """
    Fetch holidays from company's default holiday list
    Returns list of date strings in YYYY-MM-DD format
    """
    if not company:
        return []

    holiday_list = frappe.db.get_value("Company", company, "default_holiday_list")
    if not holiday_list:
        frappe.logger().info(f"No holiday list found for company: {company}")
        return []

    holidays = frappe.db.get_all(
        "Holiday",
        filters={
            "parent": holiday_list,
            "holiday_date": ["between", [start_date, end_date]]
        },
        pluck="holiday_date"
    )

    frappe.logger().info(f"Found {len(holidays)} holidays for {company} from {start_date} to {end_date}")
    
    # Return as YYYY-MM-DD strings
    return [str(h) for h in holidays]


@frappe.whitelist()
def get_employee_attendance_for_year(employee, year):
    """
    Get full year attendance (used by calendar modal)
    """
    if not employee or not year:
        return {}

    records = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [f"{year}-01-01", f"{year}-12-31"]],
            "status": ["in", ["Present", "Absent", "Half Day", "Holiday"]]
        },
        fields=["attendance_date", "status"]
    )

    attendance_map = {}

    for r in records:
        attendance_map[str(r.attendance_date)] = r.status

    return attendance_map