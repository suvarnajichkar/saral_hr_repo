import frappe
from frappe import _

def get_context(context):
    context.no_cache = 1
    context.employees = get_employees()
    return context

def get_employees():
    """Get all employees with proper name handling"""
    employees = frappe.db.sql("""
        SELECT
            name,
            employee_name,
            first_name,
            last_name,
            status
        FROM `tabEmployee`
        ORDER BY 
            CASE 
                WHEN employee_name IS NOT NULL AND employee_name != '' 
                THEN employee_name
                ELSE COALESCE(first_name, name)
            END
    """, as_dict=1)

    result = []
    for emp in employees:
        display_name = None
        
        if emp.get('employee_name'):
            display_name = emp['employee_name'].strip()
        
        if not display_name:
            parts = []
            if emp.get('first_name'):
                parts.append(emp['first_name'].strip())
            if emp.get('last_name'):
                parts.append(emp['last_name'].strip())
            
            if parts:
                display_name = ' '.join(parts)
        
        if not display_name:
            display_name = emp['name']
        
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

    # Query Company Link table with correct column name
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

    # Format the response
    for record in timeline:
        if record.get('start_date'):
            record['start_date'] = frappe.utils.formatdate(record['start_date'], "dd-MM-yyyy")
        else:
            record['start_date'] = '-'
        
        if record.get('end_date'):
            record['end_date'] = frappe.utils.formatdate(record['end_date'], "dd-MM-yyyy")
        else:
            record['end_date'] = None

    return timeline

@frappe.whitelist()
def fix_employee_names():
    """
    Utility to fix missing employee_name fields.
    """
    employees_to_fix = frappe.db.sql("""
        SELECT name, first_name, last_name, employee_name
        FROM `tabEmployee`
        WHERE employee_name IS NULL 
           OR employee_name = ''
           OR TRIM(employee_name) = ''
    """, as_dict=1)

    fixed_count = 0
    for emp in employees_to_fix:
        parts = []
        if emp.get('first_name'):
            parts.append(emp['first_name'].strip())
        if emp.get('last_name'):
            parts.append(emp['last_name'].strip())
        
        new_name = ' '.join(parts) if parts else emp['name']
        
        try:
            frappe.db.set_value(
                'Employee', 
                emp['name'], 
                'employee_name', 
                new_name,
                update_modified=False
            )
            fixed_count += 1
        except Exception as e:
            frappe.log_error(
                message=f"Failed to update employee {emp['name']}: {str(e)}",
                title="Employee Name Fix Error"
            )

    frappe.db.commit()
    
    return {
        "success": True,
        "fixed_count": fixed_count,
        "message": f"Successfully fixed {fixed_count} employee records"
    }