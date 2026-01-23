import frappe
from frappe.utils import getdate

@frappe.whitelist()
def get_active_employees():
    employees = frappe.get_all(
        "Company Link",
        filters={"is_active": 1},
        fields=["name", "employee", "full_name", "company", "weekly_off"],
        order_by="full_name asc"
    )
    
    # Fetch Aadhaar numbers for each employee
    for emp in employees:
        aadhaar = frappe.db.get_value("Employee", emp.employee, "aadhar_number")
        emp["aadhaar_number"] = aadhaar or ""
    
    return employees

@frappe.whitelist()
def get_attendance_between_dates(employee, start_date, end_date):
    start_date = getdate(start_date)
    end_date = getdate(end_date)

    attendance_records = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]]
        },
        fields=["attendance_date", "status"]
    )

    attendance_map = {str(row.attendance_date): row.status for row in attendance_records}
    return attendance_map

@frappe.whitelist()
def save_attendance(employee, attendance_date, status):
    attendance_date = getdate(attendance_date)

    # Check if it's a weekly off - if yes, skip saving (don't throw error)
    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")
    if weekly_off:
        weekly_off_days = [d.strip().lower() for d in weekly_off.split(",")]
        day_name = attendance_date.strftime("%A").lower()
        if day_name in weekly_off_days:
            # Skip saving for weekly off, but don't throw error
            return "skipped_weekly_off"

    existing_attendance = frappe.db.get_value(
        "Attendance",
        {"employee": employee, "attendance_date": attendance_date},
        "name"
    )

    if existing_attendance:
        doc = frappe.get_doc("Attendance", existing_attendance)
        doc.status = status
        doc.flags.ignore_validate = True
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee,
            "attendance_date": attendance_date,
            "status": status
        })
        doc.flags.ignore_validate = True
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return "success"