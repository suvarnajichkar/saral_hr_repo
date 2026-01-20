import frappe
from frappe.utils import getdate

# -------------------------------
# 1️⃣ Get only ACTIVE employees (Company Link active)
# -------------------------------
@frappe.whitelist()
def get_active_employees():
    """
    Return all active employees along with their Company Link info,
    including weekly off.
    """
    employees = frappe.get_all(
        "Company Link",
        filters={"is_active": 1},
        fields=["name", "employee", "full_name", "company", "weekly_off"],
        order_by="full_name asc"
    )
    return employees


# ------------------------------------------------
# 2️⃣ Get attendance between start & end dates
# ------------------------------------------------
@frappe.whitelist()
def get_attendance_between_dates(employee, start_date, end_date):
    """
    Return a dict: {date: status} for the given employee (Company Link ID)
    and date range.
    """
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

    # Convert list → dict for easy JS lookup
    attendance_map = {str(row.attendance_date): row.status for row in attendance_records}
    return attendance_map


# ----------------------------------------
# 3️⃣ Create or Update Attendance record
# ----------------------------------------
@frappe.whitelist()
def save_attendance(employee, attendance_date, status):
    """
    Create or update an attendance record for the employee on the given date.
    Weekly Off days cannot be marked.
    """
    attendance_date = getdate(attendance_date)

    # 🔹 Fetch Weekly Off from Company Link
    weekly_off = frappe.db.get_value("Company Link", employee, "weekly_off")

    if weekly_off:
        weekly_off_days = [d.strip().lower() for d in weekly_off.split(",")]
        day_name = attendance_date.strftime("%A").lower()
        if day_name in weekly_off_days:
            frappe.throw(f"Cannot mark attendance on Weekly Off ({day_name.capitalize()}).")

    existing_attendance = frappe.db.get_value(
        "Attendance",
        {"employee": employee, "attendance_date": attendance_date},
        "name"
    )

    if existing_attendance:
        # Update existing record
        doc = frappe.get_doc("Attendance", existing_attendance)
        doc.status = status
        doc.flags.ignore_validate = True
        doc.save(ignore_permissions=True)
    else:
        # Create new record
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