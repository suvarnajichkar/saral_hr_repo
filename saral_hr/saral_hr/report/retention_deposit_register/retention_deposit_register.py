# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt, getdate, add_months

COMPONENT_NAME = "Retention"

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}


def execute(filters=None):
    filters = filters or {}
    validate_filters(filters)
    columns = get_columns()
    data    = get_data(filters)
    return columns, data


def validate_filters(filters):
    if not filters.get("month"):
        frappe.throw("Please select a Month")
    if not filters.get("year"):
        frappe.throw("Please select a Year")
    if not filters.get("company"):
        frappe.throw("Please select at least one Company")
    if not filters.get("category"):
        frappe.throw("Please select a Category")


def get_columns():
    return [
        {
            "label": "Sr. No.",
            "fieldname": "sr_no",
            "fieldtype": "Int",
            "width": 70
        },
        {
            "label": "Employee ID",
            "fieldname": "employee_id",
            "fieldtype": "Data",
            "width": 160
        },
        {
            "label": "Employee Name",
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 220
        },
        {
            "label": "Date of Joining",
            "fieldname": "date_of_joining",
            "fieldtype": "Date",
            "width": 150
        },
        {
            "label": "Deduction Upto (3 Years)",
            "fieldname": "ded_upto",
            "fieldtype": "Date",
            "width": 180
        },
        {
            "label": "Retention Deposit",
            "fieldname": "retention_amount",
            "fieldtype": "Float",
            "precision": 2,
            "width": 180
        },
    ]


def get_data(filters):
    import json

    month          = filters.get("month")
    year           = filters.get("year")
    category       = filters.get("category")       # single string (Link field)
    company_filter = filters.get("company")

    month_num  = MONTH_MAP.get(month)
    start_date = f"{year}-{month_num:02d}-01"

    conditions   = ""
    query_params = {"start_date": start_date, "component": COMPONENT_NAME}

    if company_filter:
        if isinstance(company_filter, str):
            company_filter = json.loads(company_filter)
        if company_filter:
            conditions += " AND ss.company IN %(companies)s"
            query_params["companies"] = tuple(company_filter)

    employee_filter = filters.get("employee")
    if employee_filter:
        if isinstance(employee_filter, str):
            employee_filter = json.loads(employee_filter)
        if employee_filter:
            conditions += " AND ss.employee IN %(employees)s"
            query_params["employees"] = tuple(employee_filter)

    # Category filter via Company Link (same pattern as all other reports)
    category_join = ""
    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON  cl.name     = ss.employee
                AND cl.category = %(category)s
        """
        query_params["category"] = category

    rows = frappe.db.sql("""
        SELECT
            ss.employee      AS employee_id,
            ss.employee_name AS employee_name,
            sd.amount        AS retention_amount
        FROM
            `tabSalary Slip` ss
        INNER JOIN
            `tabSalary Details` sd
            ON  sd.parent           = ss.name
            AND sd.parenttype       = 'Salary Slip'
            AND sd.parentfield      = 'deductions'
            AND sd.salary_component = %(component)s
            AND sd.amount > 0
        {category_join}
        WHERE
            ss.docstatus      = 1
            AND ss.start_date = %(start_date)s
            {conditions}
        ORDER BY
            ss.employee_name
    """.format(conditions=conditions, category_join=category_join), query_params, as_dict=1)

    if not rows:
        return []

    # Fetch date_of_joining from Company Link
    employee_ids = list({r.employee_id for r in rows})

    cl_rows = frappe.db.sql("""
        SELECT name, date_of_joining
        FROM `tabCompany Link`
        WHERE name IN %(ids)s
    """, {"ids": tuple(employee_ids)}, as_dict=1)

    cl_map = {r["name"]: r["date_of_joining"] for r in cl_rows}

    data            = []
    total_retention = 0.0

    for idx, row in enumerate(rows, start=1):
        doj      = cl_map.get(row.employee_id)
        ded_upto = None

        if doj:
            try:
                ded_upto = add_months(getdate(doj), 36)
            except Exception:
                ded_upto = None

        retention = flt(row.retention_amount, 2)
        total_retention += retention

        data.append({
            "sr_no":            idx,
            "employee_id":      row.employee_id,
            "employee_name":    row.employee_name,
            "date_of_joining":  doj,
            "ded_upto":         ded_upto,
            "retention_amount": retention,
        })

    # Totals row
    data.append({
        "sr_no":            "",
        "employee_id":      "",
        "employee_name":    "Total",
        "date_of_joining":  None,
        "ded_upto":         None,
        "retention_amount": flt(total_retention, 2),
        "bold":             1,
    })

    return data


@frappe.whitelist()
def get_retention_employees_for_filter(year=None, month=None, companies=None, category=None, txt=""):
    """
    Returns employees who have a Retention deduction in their submitted salary slip
    for the period, filtered by company and category.
    Used by the Employee MultiSelectList filter.
    """
    if not month or not year:
        return []

    month_num = MONTH_MAP.get(month)
    if not month_num:
        return []

    import json
    if isinstance(companies, str):
        try:
            companies = json.loads(companies)
        except Exception:
            companies = []

    start_date = f"{year}-{month_num:02d}-01"
    txt_filter = f"%{txt}%"

    company_condition = ""
    category_join     = ""
    params = {
        "component":  COMPONENT_NAME,
        "start_date": start_date,
        "txt":        txt_filter,
    }

    if companies:
        company_condition = "AND ss.company IN %(companies)s"
        params["companies"] = tuple(companies)

    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON  cl.name     = ss.employee
                AND cl.category = %(category)s
        """
        params["category"] = category

    results = frappe.db.sql("""
        SELECT DISTINCT
            ss.employee,
            ss.employee_name
        FROM
            `tabSalary Slip` ss
        INNER JOIN
            `tabSalary Details` sd
            ON  sd.parent           = ss.name
            AND sd.parenttype       = 'Salary Slip'
            AND sd.parentfield      = 'deductions'
            AND sd.salary_component = %(component)s
            AND sd.amount > 0
        {category_join}
        WHERE
            ss.docstatus      = 1
            AND ss.start_date = %(start_date)s
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(category_join=category_join, company_condition=company_condition), params, as_dict=1)

    return results