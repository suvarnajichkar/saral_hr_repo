import frappe
from frappe.utils import getdate

@frappe.whitelist()
def get_active_employees():
    user = frappe.session.user

    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    filters = {"is_active": 1}

    if companies:
        filters["company"] = ["in", companies]

    employees = frappe.get_all(
        "Company Link",
        filters=filters,
        fields=["name", "employee", "full_name", "company", "weekly_off"],
        order_by="full_name asc"
    )

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
    user = frappe.session.user
    attendance_date = getdate(attendance_date)
    
    frappe.logger().info(f"=== SAVE ATTENDANCE ===")
    frappe.logger().info(f"Employee: {employee}")
    frappe.logger().info(f"Date: {attendance_date}")
    frappe.logger().info(f"Status: {status}")

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
def save_attendance_batch(attendance_data):
    """
    Batch save attendance records for better performance.
    This reduces the number of database commits and improves save speed.
    """
    import json
    
    user = frappe.session.user
    
    # Parse the attendance data if it's a string
    if isinstance(attendance_data, str):
        attendance_data = json.loads(attendance_data)
    
    frappe.logger().info(f"=== BATCH SAVE ATTENDANCE ===")
    frappe.logger().info(f"Processing {len(attendance_data)} records")
    
    # Get user's allowed companies
    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )
    
    saved_count = 0
    errors = []
    
    # Use enqueue for better performance and avoid timeout/conflict issues
    try:
        for record in attendance_data:
            try:
                employee = record.get('employee')
                attendance_date = getdate(record.get('attendance_date'))
                status = record.get('status')
                
                # Check permissions
                if companies:
                    allowed = frappe.db.exists(
                        "Company Link",
                        {
                            "employee": employee,
                            "company": ["in", companies]
                        }
                    )
                    
                    if not allowed:
                        errors.append(f"Not permitted for employee {employee} on {attendance_date}")
                        continue
                
                # Check if attendance already exists
                existing_attendance = frappe.db.get_value(
                    "Attendance",
                    {"employee": employee, "attendance_date": attendance_date},
                    "name"
                )
                
                if existing_attendance:
                    # Update existing record using SQL for speed
                    frappe.db.set_value(
                        "Attendance",
                        existing_attendance,
                        "status",
                        status,
                        update_modified=False  # Prevent modification timestamp conflicts
                    )
                    frappe.logger().info(f"Updated: {employee} - {attendance_date} - {status}")
                else:
                    # Create new record
                    doc = frappe.get_doc({
                        "doctype": "Attendance",
                        "employee": employee,
                        "attendance_date": attendance_date,
                        "status": status
                    })
                    doc.flags.ignore_validate = True
                    doc.flags.ignore_mandatory = True
                    doc.insert(ignore_permissions=True)
                    frappe.logger().info(f"Created: {employee} - {attendance_date} - {status}")
                
                saved_count += 1
                
            except Exception as e:
                error_msg = f"Error for {record.get('employee')} on {record.get('attendance_date')}: {str(e)}"
                frappe.logger().error(error_msg)
                errors.append(error_msg)
        
        # Single commit for all records
        frappe.db.commit()
        
        frappe.logger().info(f"✓ Batch save completed: {saved_count} records saved")
        
        if errors:
            frappe.logger().warning(f"Errors encountered: {errors}")
        
        return {
            "success": True,
            "saved_count": saved_count,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Batch save failed: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@frappe.whitelist()
def get_holidays_between_dates(company, start_date, end_date):
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
    
    return [str(h) for h in holidays]


@frappe.whitelist()
def get_employee_attendance_for_year(employee, year):
    if not employee or not year:
        return {}

    records = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [f"{year}-01-01", f"{year}-12-31"]],
            "status": ["in", ["Present", "Absent", "Half Day", "Holiday", "LWP"]]
        },
        fields=["attendance_date", "status"]
    )

    attendance_map = {}

    for r in records:
        attendance_map[str(r.attendance_date)] = r.status

    return attendance_map