# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}

VARIABLE_LIKE = "%variable%"


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
            "width": 60
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
            "label": "Division",
            "fieldname": "division",
            "fieldtype": "Data",
            "width": 150
        },
        {
            "label": "Monthly Variable Pay",
            "fieldname": "monthly_variable_pay",
            "fieldtype": "Float",
            "precision": 2,
            "width": 180
        },
        {
            "label": "Variable Pay %",
            "fieldname": "variable_pay_percentage",
            "fieldtype": "Percent",
            "width": 130
        },
        {
            "label": "Variable Pay Amount",
            "fieldname": "variable_pay_amount",
            "fieldtype": "Float",
            "precision": 2,
            "width": 180
        },
    ]


def get_data(filters):
    import json

    month          = filters.get("month")
    year           = filters.get("year")
    category       = filters.get("category")      # single string (Link field)
    company_filter = filters.get("company")

    month_num  = MONTH_MAP.get(month)
    start_date = f"{year}-{month_num:02d}-01"

    vpa_name = f"{year} - {month}"

    conditions    = ""
    query_params  = {
        "start_date":    start_date,
        "variable_like": VARIABLE_LIKE,
    }

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
            INNER JOIN `tabCompany Link` cl_cat
                ON  cl_cat.name     = ss.employee
                AND cl_cat.category = %(category)s
        """
        query_params["category"] = category

    # ── Main query ─────────────────────────────────────────────────────────
    rows = frappe.db.sql("""
        SELECT
            ss.name             AS slip_name,
            ss.employee         AS employee_id,
            ss.employee_name    AS employee_name,
            ss.salary_structure AS salary_structure,
            cl.division         AS division,
            COALESCE(sd.amount, 0) AS variable_pay_amount
        FROM
            `tabSalary Slip` ss
        LEFT JOIN
            `tabCompany Link` cl ON cl.name = ss.employee
        LEFT JOIN
            `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'earnings'
            AND LOWER(sd.salary_component) LIKE %(variable_like)s
        {category_join}
        WHERE
            ss.docstatus      = 1
            AND ss.start_date = %(start_date)s
            AND EXISTS (
                SELECT 1
                FROM `tabSalary Structure Assignment` ssa
                INNER JOIN `tabSalary Details` ssa_sd
                    ON  ssa_sd.parent      = ssa.name
                    AND ssa_sd.parenttype  = 'Salary Structure Assignment'
                    AND ssa_sd.parentfield = 'earnings'
                    AND LOWER(ssa_sd.salary_component) LIKE %(variable_like)s
                    AND ssa_sd.amount > 0
                WHERE
                    ssa.employee   = ss.employee
                    AND ssa.from_date <= %(start_date)s
                    AND (ssa.to_date IS NULL OR ssa.to_date >= %(start_date)s)
            )
            {conditions}
        ORDER BY
            ss.employee_name
    """.format(conditions=conditions, category_join=category_join), query_params, as_dict=1)

    if not rows:
        return []

    # ── Variable Pay % from Variable Pay Assignment ─────────────────────────
    vpa_percentage_map = {}
    if frappe.db.exists("Variable Pay Assignment", vpa_name):
        vpa_rows = frappe.db.sql("""
            SELECT division, percentage
            FROM `tabVariable Pay Detail Table`
            WHERE parent     = %(vpa)s
              AND parenttype = 'Variable Pay Assignment'
        """, {"vpa": vpa_name}, as_dict=1)
        vpa_percentage_map = {r.division: flt(r.percentage) for r in vpa_rows}

    # ── Monthly Variable Pay from SSA per employee ──────────────────────────
    employee_ids = list({r.employee_id for r in rows})
    emp_variable_map = {}

    if employee_ids:
        emp_ssa_rows = frappe.db.sql("""
            SELECT
                ssa.employee,
                ssa_sd.amount AS monthly_variable_pay
            FROM
                `tabSalary Structure Assignment` ssa
            INNER JOIN
                `tabSalary Details` ssa_sd
                ON  ssa_sd.parent      = ssa.name
                AND ssa_sd.parenttype  = 'Salary Structure Assignment'
                AND ssa_sd.parentfield = 'earnings'
                AND LOWER(ssa_sd.salary_component) LIKE %(variable_like)s
                AND ssa_sd.amount > 0
            WHERE
                ssa.employee IN %(employees)s
                AND ssa.from_date <= %(start_date)s
                AND (ssa.to_date IS NULL OR ssa.to_date >= %(start_date)s)
            ORDER BY
                ssa.from_date DESC
        """, {
            "employees":     tuple(employee_ids),
            "start_date":    start_date,
            "variable_like": VARIABLE_LIKE,
        }, as_dict=1)

        for r in emp_ssa_rows:
            if r.employee not in emp_variable_map:
                emp_variable_map[r.employee] = flt(r.monthly_variable_pay)

    # ── Build result ────────────────────────────────────────────────────────
    data                   = []
    total_monthly_var_pay  = 0.0
    total_variable_pay_amt = 0.0

    for idx, row in enumerate(rows, start=1):
        division            = row.division or ""
        percentage          = vpa_percentage_map.get(division, 0.0)
        monthly_vp          = emp_variable_map.get(row.employee_id, 0.0)
        variable_pay_amount = flt(row.variable_pay_amount, 2)

        total_monthly_var_pay  += monthly_vp
        total_variable_pay_amt += variable_pay_amount

        data.append({
            "sr_no":                   idx,
            "employee_id":             row.employee_id,
            "employee_name":           row.employee_name,
            "division":                division,
            "monthly_variable_pay":    flt(monthly_vp, 2),
            "variable_pay_percentage": flt(percentage, 2),
            "variable_pay_amount":     variable_pay_amount,
        })

    # Totals row
    data.append({
        "sr_no":                   None,
        "employee_id":             "",
        "employee_name":           "Total",
        "division":                "",
        "monthly_variable_pay":    flt(total_monthly_var_pay, 2),
        "variable_pay_percentage": None,
        "variable_pay_amount":     flt(total_variable_pay_amt, 2),
        "bold":                    1,
    })

    return data


@frappe.whitelist()
def get_vp_employees_for_filter(year=None, month=None, companies=None, category=None, txt=""):
    """
    Returns only employees who have Variable Pay > 0 in their active SSA
    for the given period, filtered by company and category.
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
        "start_date":    start_date,
        "txt":           txt_filter,
        "variable_like": VARIABLE_LIKE,
    }

    if companies:
        company_condition = "AND ss.company IN %(companies)s"
        params["companies"] = tuple(companies)

    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl_cat
                ON  cl_cat.name     = ss.employee
                AND cl_cat.category = %(category)s
        """
        params["category"] = category

    results = frappe.db.sql("""
        SELECT DISTINCT
            ss.employee,
            ss.employee_name
        FROM
            `tabSalary Slip` ss
        {category_join}
        WHERE
            ss.docstatus      = 1
            AND ss.start_date = %(start_date)s
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            AND EXISTS (
                SELECT 1
                FROM `tabSalary Structure Assignment` ssa
                INNER JOIN `tabSalary Details` ssa_sd
                    ON  ssa_sd.parent      = ssa.name
                    AND ssa_sd.parenttype  = 'Salary Structure Assignment'
                    AND ssa_sd.parentfield = 'earnings'
                    AND LOWER(ssa_sd.salary_component) LIKE %(variable_like)s
                    AND ssa_sd.amount > 0
                WHERE
                    ssa.employee   = ss.employee
                    AND ssa.from_date <= %(start_date)s
                    AND (ssa.to_date IS NULL OR ssa.to_date >= %(start_date)s)
            )
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(category_join=category_join, company_condition=company_condition), params, as_dict=1)

    return results