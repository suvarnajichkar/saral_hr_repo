import frappe
from frappe import _

def get_context(context):
    context.no_cache = 1
    context.employees = get_employees()
    return context

def get_employees():
    try:
        employees = frappe.get_all(
            "Employee",
            fields=["name", "employee_name as employee"],
            filters={"status": "Active"},
            order_by="employee_name asc"
        )
    except:
        try:
            employees = frappe.db.sql("""
                SELECT 
                    name,
                    CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as employee
                FROM `tabEmployee`
                WHERE status = 'Active'
                ORDER BY first_name, last_name
            """, as_dict=1)
        except:
            employees = frappe.get_all(
                "Employee",
                fields=["name", "name as employee"],
                filters={"status": "Active"},
                order_by="name asc"
            )
    
    return employees

@frappe.whitelist()
def get_employee_timeline(employee):
    if not employee:
        return []
    
    if not frappe.db.exists("Employee", employee):
        frappe.throw(_("Employee not found"))
    
    timeline = frappe.db.sql("""
        SELECT 
            company,
            date_of_joining as start_date,
            left_date as end_date,
            is_active
        FROM `tabCompany Link`
        WHERE employee = %(employee)s
        ORDER BY 
            is_active DESC,
            COALESCE(left_date, '9999-12-31') DESC,
            date_of_joining DESC
    """, {"employee": employee}, as_dict=1)
    
    for record in timeline:
        record.status = "Active" if record.is_active else "Inactive"
        
        if record.start_date:
            record.start_date = frappe.utils.formatdate(record.start_date, "dd-MM-yyyy")
        
        if record.end_date:
            record.end_date = frappe.utils.formatdate(record.end_date, "dd-MM-yyyy")
    
    return timeline
