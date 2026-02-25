# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}

# Maharashtra PT slabs
PT_SLABS = [
    {"label": "Upto Rs. 2,000",          "min": 0,     "max": 2000,  "rate": 0},
    {"label": "Rs. 2,001 to Rs. 2,500",  "min": 2001,  "max": 2500,  "rate": 0},
    {"label": "Rs. 2,501 to Rs. 3,500",  "min": 2501,  "max": 3500,  "rate": 60},
    {"label": "Rs. 3,501 to Rs. 7,500",  "min": 3501,  "max": 7500,  "rate": 120},
    {"label": "Rs. 7,501 to Rs. 10,000", "min": 7501,  "max": 10000, "rate": 175},
    {"label": "Above Rs. 10,000",        "min": 10001, "max": None,  "rate": 200},
]


def get_slab(gross):
    for slab in PT_SLABS:
        if slab["max"] is None:
            if gross >= slab["min"]:
                return slab
        else:
            if slab["min"] <= gross <= slab["max"]:
                return slab
    return PT_SLABS[0]


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
            "label":     "Salary Range",
            "fieldname": "salary_range",
            "fieldtype": "Data",
            "width":     220
        },
        {
            "label":     "PT Rate (Rs.)",
            "fieldname": "pt_rate",
            "fieldtype": "Float",
            "precision": 2,
            "width":     130
        },
        {
            "label":     "No. of Employees",
            "fieldname": "employee_count",
            "fieldtype": "Int",
            "width":     150
        },
        {
            "label":     "Total Earnings",
            "fieldname": "total_earnings",
            "fieldtype": "Float",
            "precision": 2,
            "width":     160
        },
        {
            "label":     "PT Amount (Rs.)",
            "fieldname": "pt_amount",
            "fieldtype": "Float",
            "precision": 2,
            "width":     150
        },
    ]


def get_data(filters):
    import json

    month          = filters.get("month")
    year           = filters.get("year")
    category       = filters.get("category")        # single string (Link field)
    company_filter = filters.get("company")

    month_num  = MONTH_MAP.get(month)
    start_date = "%s-%02d-01" % (year, month_num)

    where_clauses = ["ss.docstatus = 1", "ss.start_date = %(start_date)s"]
    query_params  = {"start_date": start_date}

    if company_filter:
        if isinstance(company_filter, str):
            company_filter = json.loads(company_filter)
        if company_filter:
            where_clauses.append("ss.company IN %(companies)s")
            query_params["companies"] = tuple(company_filter)

    employee_filter = filters.get("employee")
    if employee_filter:
        if isinstance(employee_filter, str):
            employee_filter = json.loads(employee_filter)
        if employee_filter:
            where_clauses.append("ss.employee IN %(employees)s")
            query_params["employees"] = tuple(employee_filter)

    # Category filter via Company Link (same pattern as Salary Summary / LWF)
    category_join = ""
    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON  cl.name     = ss.employee
                AND cl.category = %(category)s
        """
        query_params["category"] = category

    where_sql = " AND ".join(where_clauses)

    # Fetch all employees with their gross earnings
    rows = frappe.db.sql("""
        SELECT
            ss.employee       AS employee_id,
            ss.total_earnings AS gross
        FROM `tabSalary Slip` ss
        {category_join}
        WHERE {where}
        ORDER BY ss.employee_name
    """.format(where=where_sql, category_join=category_join), query_params, as_dict=1)

    if not rows:
        # Return empty slab rows so columns still show
        data = []
        for slab in PT_SLABS:
            data.append({
                "salary_range":   slab["label"],
                "pt_rate":        flt(slab["rate"], 2),
                "employee_count": 0,
                "total_earnings": 0.0,
                "pt_amount":      0.0,
                "_row_type":      "slab",
            })
        data.append({
            "salary_range":   "Total",
            "pt_rate":        None,
            "employee_count": 0,
            "total_earnings": 0.0,
            "pt_amount":      0.0,
            "bold":           1,
            "_row_type":      "total",
        })
        return data

    # Fetch actual PT deducted per employee from salary slip
    pt_params        = dict(query_params)
    pt_params["pt_like"] = "%professional tax%"

    pt_rows = frappe.db.sql("""
        SELECT
            ss.employee,
            SUM(sd.amount) AS pt_amount
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'deductions'
            AND LOWER(sd.salary_component) LIKE %(pt_like)s
        {category_join}
        WHERE {where}
        GROUP BY ss.employee
    """.format(where=where_sql, category_join=category_join), pt_params, as_dict=1)

    pt_map = {r.employee: flt(r.pt_amount) for r in pt_rows}

    # Aggregate into slabs
    slab_data = {
        s["label"]: {
            "rate":     s["rate"],
            "count":    0,
            "earnings": 0.0,
            "amount":   0.0,
        }
        for s in PT_SLABS
    }

    for row in rows:
        gross = flt(row.gross, 2)
        slab  = get_slab(gross)

        pt = pt_map.get(row.employee_id, 0.0)

        # Skip employees who have no PT deduction
        if pt <= 0:
            continue

        slab_data[slab["label"]]["count"]    += 1
        slab_data[slab["label"]]["earnings"] += gross
        slab_data[slab["label"]]["amount"]   += pt

    # Build output rows
    data           = []
    grand_earnings = 0.0
    grand_count    = 0
    grand_pt       = 0.0

    for slab in PT_SLABS:
        info = slab_data[slab["label"]]
        grand_earnings += info["earnings"]
        grand_count    += info["count"]
        grand_pt       += info["amount"]

        data.append({
            "salary_range":   slab["label"],
            "pt_rate":        flt(slab["rate"], 2),
            "employee_count": info["count"],
            "total_earnings": flt(info["earnings"], 2),
            "pt_amount":      flt(info["amount"], 2),
            "_row_type":      "slab",
        })

    # Grand total row
    data.append({
        "salary_range":   "Total",
        "pt_rate":        None,
        "employee_count": grand_count,
        "total_earnings": flt(grand_earnings, 2),
        "pt_amount":      flt(grand_pt, 2),
        "bold":           1,
        "_row_type":      "total",
    })

    return data




@frappe.whitelist()
def get_pt_employees_for_filter(year=None, month=None, companies=None, category=None, txt=""):
    """
    Returns employees with a PT deduction in their submitted salary slip for the period,
    filtered by company and category — used by the Employee MultiSelectList filter.
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

    start_date = "%s-%02d-01" % (year, month_num)
    txt_filter = f"%{txt}%"

    company_condition = ""
    category_join     = ""
    params = {
        "start_date": start_date,
        "txt":        txt_filter,
        "pt_like":    "%professional tax%",
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
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'deductions'
            AND LOWER(sd.salary_component) LIKE %(pt_like)s
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