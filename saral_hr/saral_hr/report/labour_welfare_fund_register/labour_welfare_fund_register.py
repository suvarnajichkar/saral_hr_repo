# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

COMPONENT_NAME = "Employee -Labour Welfare Fund"

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
            "label": "Mobile No",
            "fieldname": "mobile_no",
            "fieldtype": "Data",
            "width": 150
        },
        {
            "label": "Aadhar No",
            "fieldname": "aadhar_no",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": "Net Salary",
            "fieldname": "net_salary",
            "fieldtype": "Float",
            "precision": 2,
            "width": 160
        },
        {
            "label": "LWF Amount",
            "fieldname": "lwf_amount",
            "fieldtype": "Float",
            "precision": 2,
            "width": 150
        },
    ]


def get_data(filters):
    month            = filters.get("month")
    year             = filters.get("year")
    employee_filter  = filters.get("employee")   # list from MultiSelectList
    company_filter   = filters.get("company")    # list from MultiSelectList

    month_num  = MONTH_MAP.get(month)
    start_date = f"{year}-{month_num:02d}-01"

    conditions  = ""
    query_params = {"start_date": start_date, "component": COMPONENT_NAME}

    # --- Company filter ---
    if company_filter:
        if isinstance(company_filter, str):
            import json
            company_filter = json.loads(company_filter)
        if company_filter:
            conditions += " AND ss.company IN %(companies)s"
            query_params["companies"] = tuple(company_filter)

    # --- Employee filter ---
    if employee_filter:
        if isinstance(employee_filter, str):
            import json
            employee_filter = json.loads(employee_filter)
        if employee_filter:
            conditions += " AND ss.employee IN %(employees)s"
            query_params["employees"] = tuple(employee_filter)

    rows = frappe.db.sql("""
        SELECT
            ss.employee        AS employee_id,
            ss.employee_name   AS employee_name,
            ss.net_salary      AS net_salary,
            sd.amount          AS lwf_amount
        FROM
            `tabSalary Slip` ss
        INNER JOIN
            `tabSalary Details` sd
            ON  sd.parent           = ss.name
            AND sd.parenttype       = 'Salary Slip'
            AND sd.parentfield      = 'deductions'
            AND sd.salary_component = %(component)s
            AND sd.amount > 0
        WHERE
            ss.docstatus    = 1
            AND ss.start_date = %(start_date)s
            {conditions}
        ORDER BY
            ss.employee_name
    """.format(conditions=conditions), query_params, as_dict=1)

    if not rows:
        return []

    # --- Enrich with Employee master data ---
    employee_ids = list({r.employee_id for r in rows})

    cl_records = frappe.db.get_all(
        "Company Link",
        filters={"name": ["in", employee_ids]},
        fields=["name", "employee"]
    )
    cl_map = {r.name: r.employee for r in cl_records}

    emp_master_ids = [v for v in cl_map.values() if v]
    emp_details_map = {}
    if emp_master_ids:
        emp_records = frappe.db.get_all(
            "Employee",
            filters={"name": ["in", emp_master_ids]},
            fields=["name", "cell_number", "aadhar_number"]
        )
        emp_details_map = {r.name: r for r in emp_records}

    data             = []
    total_net_salary = 0.0
    total_lwf        = 0.0

    for idx, row in enumerate(rows, start=1):
        emp_master_id = cl_map.get(row.employee_id)
        emp_detail    = emp_details_map.get(emp_master_id, {})

        net = flt(row.net_salary, 2)
        lwf = flt(row.lwf_amount, 2)

        total_net_salary += net
        total_lwf        += lwf

        data.append({
            "sr_no":         idx,
            "employee_id":   row.employee_id,
            "employee_name": row.employee_name,
            "mobile_no":     emp_detail.get("cell_number") or "-",
            "aadhar_no":     emp_detail.get("aadhar_number") or "-",
            "net_salary":    net,
            "lwf_amount":    lwf,
        })

    # Totals row
    data.append({
        "sr_no":         "",
        "employee_id":   "",
        "employee_name": "Total",
        "mobile_no":     "",
        "aadhar_no":     "",
        "net_salary":    flt(total_net_salary, 2),
        "lwf_amount":    flt(total_lwf, 2),
        "bold":          1,
    })

    return data


@frappe.whitelist()
def get_lwf_employees_for_filter(year=None, month=None, companies=None, txt=""):
    """
    Called by the Employee MultiSelectList get_data in JS.
    Returns employees who have a submitted slip with LWF > 0 for the period.
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
    params = {
        "component":  COMPONENT_NAME,
        "start_date": start_date,
        "txt":        txt_filter,
    }

    if companies:
        company_condition = "AND ss.company IN %(companies)s"
        params["companies"] = tuple(companies)

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
        WHERE
            ss.docstatus    = 1
            AND ss.start_date = %(start_date)s
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(company_condition=company_condition), params, as_dict=1)

    return results