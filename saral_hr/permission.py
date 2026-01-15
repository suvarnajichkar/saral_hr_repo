import frappe

def company_link_permission_query(user):
    # System Manager sees everything
    if "System Manager" in frappe.get_roles(user):
        return ""

    # get allowed companies for user
    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    if not companies:
        return "1=0"

    companies_escaped = ", ".join(
        frappe.db.escape(c) for c in companies
    )

    return f"""
        `tabCompany Link`.company IN ({companies_escaped})
    """
def employee_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    if not companies:
        return "1=0"

    companies_escaped = ", ".join(
        frappe.db.escape(c) for c in companies
    )

    return f"""
        `tabEmployee`.name IN (
            SELECT cl.employee
            FROM `tabCompany Link` cl
            WHERE cl.company IN ({companies_escaped})
        )
    """
def attendance_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    companies = frappe.get_all(
        "User Permission",
        filters={
            "user": user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    if not companies:
        return "1=0"

    companies_escaped = ", ".join(
        frappe.db.escape(c) for c in companies
    )

    return f"""
        `tabAttendance`.employee IN (
            SELECT cl.name
            FROM `tabCompany Link` cl
            WHERE cl.company IN ({companies_escaped})
        )
    """
