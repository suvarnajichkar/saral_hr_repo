import frappe
from frappe import _


def get_context(context):
    context.no_cache = 1
    context.employees = get_employees()
    return context


def get_employees():
    """Get all employees with Aadhaar number"""
    employees = frappe.db.sql("""
        SELECT
            name,
            employee,
            first_name,
            last_name,
            status,
            aadhar_number
        FROM `tabEmployee`
        ORDER BY first_name, last_name
    """, as_dict=1)

    result = []
    for emp in employees:
        parts = []
        if emp.get('first_name'):
            parts.append(emp['first_name'].strip())
        if emp.get('last_name'):
            parts.append(emp['last_name'].strip())

        display_name = ' '.join(parts) if parts else emp['employee']

        if emp.get('aadhar_number'):
            display_name += f" ({emp['aadhar_number']})"

        result.append({
            'name': emp['name'],          # HR-EMP-00001
            'employee': display_name,      # Piyush Prakash Ladole (123456789012)
            'emp_id': emp['name']          # HR-EMP-00001 (for ID search)
        })

    return result


@frappe.whitelist()
def get_employee_timeline(employee):
    """Get employment timeline for an employee - ALL records including inactive"""
    if not employee:
        return []

    if not frappe.db.exists("Employee", employee):
        frappe.throw(_("Employee not found"))

    # Fetch active record (name = employee ID)
    # AND archived records (name LIKE HR-EMP-00001-1, HR-EMP-00001-2 etc.)
    timeline = frappe.db.sql("""
        SELECT 
            name,
            company,
            date_of_joining AS start_date,
            left_date AS end_date,
            is_active
        FROM `tabCompany Link`
        WHERE employee = %(employee)s
           OR name LIKE %(pattern)s
        ORDER BY 
            CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
            COALESCE(date_of_joining, '1900-01-01') DESC
    """, {
        "employee": employee,
        "pattern": "{0}-%".format(employee)
    }, as_dict=1)

    for record in timeline:
        record['start_date'] = frappe.utils.formatdate(record.get('start_date'), "dd-MM-yyyy") if record.get('start_date') else '-'
        record['end_date'] = frappe.utils.formatdate(record.get('end_date'), "dd-MM-yyyy") if record.get('end_date') else None

    return timeline


@frappe.whitelist()
def search_employees(query):
    """
    Search employees by name OR employee ID (HR-EMP-XXXXX)
    Returns matching employees for live search
    """
    if not query or len(query.strip()) < 1:
        return []

    search_term = f"%{query.strip()}%"

    employees = frappe.db.sql("""
        SELECT
            name,
            employee,
            first_name,
            last_name,
            aadhar_number
        FROM `tabEmployee`
        WHERE
            name LIKE %(search)s
            OR first_name LIKE %(search)s
            OR last_name LIKE %(search)s
            OR employee LIKE %(search)s
            OR CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) LIKE %(search)s
            OR aadhar_number LIKE %(search)s
        ORDER BY first_name, last_name
        LIMIT 20
    """, {"search": search_term}, as_dict=1)

    result = []
    for emp in employees:
        parts = []
        if emp.get('first_name'):
            parts.append(emp['first_name'].strip())
        if emp.get('last_name'):
            parts.append(emp['last_name'].strip())

        display_name = ' '.join(parts) if parts else emp['name']

        if emp.get('aadhar_number'):
            display_name += f" ({emp['aadhar_number']})"

        result.append({
            'name': emp['name'],
            'employee': display_name,
            'emp_id': emp['name']
        })

    return result


@frappe.whitelist()
def fix_employee_names():
    """Utility to generate display names dynamically"""
    employees = frappe.db.sql("""
        SELECT name, employee, first_name, last_name, aadhar_number
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

        if emp.get('aadhar_number'):
            display_name += f" ({emp['aadhar_number']})"

        result.append({
            'name': emp['name'],
            'employee': display_name
        })

    return result