import frappe
from frappe import _


def execute(filters=None):
    columns = [{"label": "", "fieldname": "dummy", "fieldtype": "Data", "width": 1}]
    data    = [{"dummy": ""}]
    return columns, data


@frappe.whitelist()
def employee_search(doctype, txt, searchfield, start, page_len, filters):
    """
    Custom search — returns full_name first (shown bold), ID second (shown as subtitle)
    """
    search = f"%{txt}%"
    return frappe.db.sql("""
        SELECT
            name,
            TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS full_name
        FROM `tabEmployee`
        WHERE
            name            LIKE %(search)s
            OR first_name   LIKE %(search)s
            OR last_name    LIKE %(search)s
            OR TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) LIKE %(search)s
            OR aadhar_number LIKE %(search)s
        ORDER BY first_name, last_name
        LIMIT %(page_len)s OFFSET %(start)s
    """, {"search": search, "page_len": int(page_len), "start": int(start)})


@frappe.whitelist()
def get_all_employees():
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

        display_name = ' '.join(parts) if parts else emp['name']

        if emp.get('aadhar_number'):
            display_name += f" ({emp['aadhar_number']})"

        result.append({
            'name':     emp['name'],
            'employee': display_name,
            'emp_id':   emp['name'],
        })

    return result


@frappe.whitelist()
def search_employees(query):
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
            'name':     emp['name'],
            'employee': display_name,
            'emp_id':   emp['name'],
        })

    return result


@frappe.whitelist()
def get_employee_timeline(employee):
    if not employee:
        return []

    if not frappe.db.exists("Employee", employee):
        return []

    timeline = frappe.db.sql("""
        SELECT
            name,
            company,
            date_of_joining AS start_date,
            left_date       AS end_date,
            is_active
        FROM `tabCompany Link`
        WHERE employee = %(employee)s
           OR name LIKE %(pattern)s
        ORDER BY
            CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
            COALESCE(date_of_joining, '1900-01-01') DESC
    """, {
        "employee": employee,
        "pattern":  "{0}-%".format(employee),
    }, as_dict=1)

    for record in timeline:
        record['start_date'] = (
            frappe.utils.formatdate(record.get('start_date'), "dd-MM-yyyy")
            if record.get('start_date') else '-'
        )
        record['end_date'] = (
            frappe.utils.formatdate(record.get('end_date'), "dd-MM-yyyy")
            if record.get('end_date') else None
        )

    return timeline