import frappe
from frappe import _

def get_context(context):
    context.no_cache = 1
    context.employees = get_employees()
    return context

def get_employees():
    """Get all employees using the 'employee' field"""
    employees = frappe.db.sql("""
        SELECT
            name,
            employee,
            first_name,
            last_name,
            status
        FROM `tabEmployee`
    """, as_dict=1)

    result = []
    for emp in employees:
        # Build display name from first_name + last_name or fallback to 'employee'
        parts = []
        if emp.get('first_name'):
            parts.append(emp['first_name'].strip())
        if emp.get('last_name'):
            parts.append(emp['last_name'].strip())
        
        display_name = ' '.join(parts) if parts else emp['employee']

        result.append({
            'name': emp['name'],
            'employee': display_name
        })

    return result

@frappe.whitelist()
def get_employee_timeline(employee):
    """Get employment timeline for an employee"""
    if not employee:
        return []

    if not frappe.db.exists("Employee", employee):
        frappe.throw(_("Employee not found"))

    timeline = frappe.db.sql("""
        SELECT 
            company,
            date_of_joining AS start_date,
            left_date AS end_date,
            is_active
        FROM `tabCompany Link`
        WHERE employee = %(employee)s
        ORDER BY 
            is_active DESC,
            COALESCE(date_of_joining, '1900-01-01') DESC
    """, {"employee": employee}, as_dict=1)

    for record in timeline:
        record['start_date'] = frappe.utils.formatdate(record.get('start_date'), "dd-MM-yyyy") if record.get('start_date') else '-'
        record['end_date'] = frappe.utils.formatdate(record.get('end_date'), "dd-MM-yyyy") if record.get('end_date') else None

    return timeline

@frappe.whitelist()
def fix_employee_names():
    """
    Utility to generate display names dynamically using 'employee' field instead of 'employee_name'.
    """
    employees = frappe.db.sql("""
        SELECT name, employee, first_name, last_name
        FROM `tabEmployee`
    """, as_dict=1)

    result = []
    for emp in employees:
        parts = []
        if emp.get('first_name'):
            parts.append(emp['first_name'].strip())
        if emp.get('last_name'):
            parts.append(emp['last_name'].strip())
        display_name = ' '.join(parts) if parts else emp['employee']

        result.append({
            'name': emp['name'],
            'employee': display_name
        })

    return result
