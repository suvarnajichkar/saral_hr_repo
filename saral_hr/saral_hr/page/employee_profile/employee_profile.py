import frappe
from frappe.utils import today, getdate


@frappe.whitelist()
def get_employee_profile_data(employee):
    emp = frappe.get_doc("Employee", employee)

    # Fetch company link name so the frontend can link to the form view
    company_link_name = frappe.db.get_value(
        "Company Link", {"employee": employee}, "name"
    )

    company_link = frappe.get_value(
        "Company Link", {"employee": employee},
        ["company", "designation", "department", "branch",
         "division", "category", "date_of_joining", "is_active", "left_date"],
        as_dict=True
    ) if company_link_name else {}

    salary = frappe.db.get_value(
        "Salary Structure Assignment",
        filters={"employee": employee, "docstatus": 1},
        fieldname=["monthly_ctc", "annual_ctc", "net_salary",
                   "gross_salary", "total_deductions", "total_employer_contribution", "from_date"],
        order_by="from_date desc",
        as_dict=True
    )

    all_attendance = frappe.get_all(
        "Attendance",
        filters={"employee": employee, "docstatus": ["!=", 2]},
        fields=["attendance_date", "status"],
        order_by="attendance_date desc"
    )

    att_map = {}
    years_set = set()
    for r in all_attendance:
        if r.attendance_date:
            date_str = str(r.attendance_date)
            att_map[date_str] = r.status
            years_set.add(date_str[:4])

    current_year = str(getdate(today()).year)
    years_set.add(current_year)
    years = sorted(list(years_set), reverse=True)

    return {
        "employee":          emp.employee,
        "first_name":        emp.first_name,
        "employee_image":    emp.employee_image,
        "date_of_birth":     str(emp.date_of_birth) if emp.date_of_birth else None,
        "pan_number":        emp.pan_number,
        "company_link":      company_link or {},
        "company_link_name": company_link_name,
        "salary":            salary,
        "attendance_map":    att_map,
        "years":             years,
    }