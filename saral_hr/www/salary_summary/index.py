import frappe

def get_context(context):
    context.companies = frappe.get_all("Company", fields=["name"])

@frappe.whitelist()
def get_salary_data(company=None, start_date=None, end_date=None):

    filters = {}

    if company:
        filters["company"] = company

    if start_date and end_date:
        filters["start_date"] = ["between", [start_date, end_date]]

    data = frappe.db.get_all(
        "Salary Slip",
        filters=filters,
        fields=[
            "employee",
            "employee_name",
            "net_salary",   # ← correct field name
            "start_date",
            "end_date",
            "company"
        ],
        order_by="employee_name asc"
    )

    return data