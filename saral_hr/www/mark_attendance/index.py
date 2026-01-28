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

    attendance_records = frappe.db.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [start_date, end_date]]
        },
        fields=["attendance_date", "status"]
    )

    return {str(row.attendance_date): row.status for row in attendance_records}


@frappe.whitelist()
def save_attendance(employee, attendance_date, status):
    user = frappe.session.user
    attendance_date = getdate(attendance_date)

    # company restriction check (dynamic)
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

    # weekly off check
    weekly_off = frappe.db.get_value(
        "Company Link",
        {"employee": employee},
        "weekly_off"
    )

    if weekly_off:
        weekly_off_days = [d.strip().lower() for d in weekly_off.split(",")]
        if attendance_date.strftime("%A").lower() in weekly_off_days:
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
