# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
    if not filters or not filters.get("employee"):
        columns = [{"label": "Message", "fieldname": "message", "fieldtype": "Data", "width": 400}]
        data = [{"message": "Please select an employee to view their timeline."}]
        return columns, data

    employee = filters["employee"]

    timeline = frappe.db.sql("""
        SELECT 
            name,
            company,
            full_name,
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

    # full_name is already on Company Link (fetched from employee.employee)
    employee_name = timeline[0].get("full_name") if timeline else employee

    for record in timeline:
        record['employee_id'] = employee
        record['employee_name'] = employee_name
        record['start_date'] = frappe.utils.formatdate(record.get('start_date'), "dd-MM-yyyy") if record.get('start_date') else '-'
        record['end_date'] = frappe.utils.formatdate(record.get('end_date'), "dd-MM-yyyy") if record.get('end_date') else None
        record['status'] = "Active" if record.get('is_active') == 1 else "Inactive"

    columns = [
        {"label": "Employee ID", "fieldname": "employee_id", "fieldtype": "Data", "width": 120},
        {"label": "Employee Name", "fieldname": "employee_name", "fieldtype": "Data", "width": 200},
        {"label": "Company", "fieldname": "company", "fieldtype": "Data", "width": 200},
        {"label": "Start Date", "fieldname": "start_date", "fieldtype": "Data", "width": 120},
        {"label": "End Date", "fieldname": "end_date", "fieldtype": "Data", "width": 120},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 100},
        {"label": "Is Active", "fieldname": "is_active", "fieldtype": "Int", "width": 80},
    ]

    return columns, timeline