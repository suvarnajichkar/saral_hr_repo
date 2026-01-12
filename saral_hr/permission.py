# import frappe

# def employee_permission_query(user):
#     roles = frappe.get_roles(user)
#     if "Group Manager" in roles:
#         return ""
#     if "HR Manager" in roles:
#         company = frappe.db.get_value("Company", {"hr_user": user}, "name")
#         if not company:
#             return "1=0"
#         company_escaped = frappe.db.escape(company, percent=False)
#         return f"`tabEmployee`.company = {company_escaped}"
#     return "1=0"

# def attendance_permission_query(user):
#     roles = frappe.get_roles(user)
#     if "Group Manager" in roles:
#         return ""
#     if "HR Manager" in roles:
#         company = frappe.db.get_value("Company", {"hr_user": user}, "name")
#         if not company:
#             return "1=0"
#         company_escaped = frappe.db.escape(company, percent=False)
#         return f"""
#             `tabAttendance`.employee IN (
#                 SELECT name
#                 FROM `tabEmployee`
#                 WHERE company = {company_escaped}
#             )
#         """
#     return "1=1"

