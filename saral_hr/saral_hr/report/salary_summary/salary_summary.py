# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

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
        {"label": "Earnings — Description", "fieldname": "description",     "fieldtype": "Data",  "width": 250},
        {"label": "Earnings — Amount",       "fieldname": "amount",          "fieldtype": "Float", "precision": 2, "width": 160},
        {"label": " ",                        "fieldname": "spacer",          "fieldtype": "Data",  "width": 40},
        {"label": "Deductions — Description","fieldname": "ded_description", "fieldtype": "Data",  "width": 250},
        {"label": "Deductions — Amount",     "fieldname": "ded_amount",      "fieldtype": "Float", "precision": 2, "width": 160},
    ]


def _parse_multiselect(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        import json
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


def get_data(filters):
    month    = filters.get("month")
    year     = filters.get("year")
    category = filters.get("category")

    companies = _parse_multiselect(filters.get("company"))
    divisions = _parse_multiselect(filters.get("division"))

    month_num  = MONTH_MAP.get(month)
    start_date = f"{year}-{month_num:02d}-01"

    query_params = {"start_date": start_date}
    conditions   = ["ss.docstatus = 1", "ss.start_date = %(start_date)s"]

    if companies:
        query_params["companies"] = tuple(companies)
        conditions.append("ss.company IN %(companies)s")

    if category:
        query_params["category"] = category
        # ss.employee = tabCompany Link.name (e.g. CL-2026-XXXXX)
        # category lives on tabCompany Link, not tabEmployee
        conditions.append("""ss.employee IN (
            SELECT name FROM `tabCompany Link`
            WHERE category = %(category)s
        )""")

    if divisions:
        query_params["divisions"] = tuple(divisions)
        conditions.append("""ss.employee IN (
            SELECT name FROM `tabCompany Link`
            WHERE division   IN %(divisions)s
               OR department IN %(divisions)s
        )""")

    where_clause = " AND ".join(conditions)

    # ── Step 1: Components that actually appear in matching slips ──────────
    earn_components = frappe.db.sql(f"""
        SELECT DISTINCT sd.salary_component
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'earnings'
        WHERE {where_clause}
        ORDER BY sd.salary_component
    """, query_params, as_list=1)
    earn_components = [r[0] for r in earn_components]

    ded_components = frappe.db.sql(f"""
        SELECT DISTINCT sd.salary_component
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'deductions'
        INNER JOIN `tabSalary Component` sc
            ON  sc.name = sd.salary_component AND sc.employer_contribution = 0
        WHERE {where_clause}
        ORDER BY sd.salary_component
    """, query_params, as_list=1)
    ded_components = [r[0] for r in ded_components]

    # ── Step 2: Totals ─────────────────────────────────────────────────────
    earn_totals_rows = frappe.db.sql(f"""
        SELECT sd.salary_component AS component, SUM(sd.amount) AS total
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'earnings'
        WHERE {where_clause}
        GROUP BY sd.salary_component
    """, query_params, as_dict=1)

    ded_totals_rows = frappe.db.sql(f"""
        SELECT sd.salary_component AS component, SUM(sd.amount) AS total
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parenttype  = 'Salary Slip'
            AND sd.parentfield = 'deductions'
        INNER JOIN `tabSalary Component` sc
            ON  sc.name = sd.salary_component AND sc.employer_contribution = 0
        WHERE {where_clause}
        GROUP BY sd.salary_component
    """, query_params, as_dict=1)

    earn_map = {r.component: flt(r.total) for r in earn_totals_rows}
    ded_map  = {r.component: flt(r.total) for r in ded_totals_rows}

    earning_rows   = [(c, earn_map.get(c, 0.0)) for c in earn_components]
    deduction_rows = [(c, ded_map.get(c, 0.0))  for c in ded_components]

    grand_earn = sum(v for _, v in earning_rows)
    grand_ded  = sum(v for _, v in deduction_rows)

    # ── Step 3: Summary stats ──────────────────────────────────────────────
    stats = frappe.db.sql(f"""
        SELECT
            COUNT(DISTINCT ss.employee) AS total_employees,
            SUM(ss.net_salary)          AS total_net_salary,
            SUM(ss.total_lwp)           AS total_lwp,
            SUM(ss.absent_days)         AS total_absent,
            SUM(ss.total_holidays)      AS total_holidays,
            SUM(ss.payment_days)        AS total_payment_days
        FROM `tabSalary Slip` ss
        WHERE {where_clause}
    """, query_params, as_dict=1)

    stats = stats[0] if stats else {}

    # ── Step 4: Build output rows ──────────────────────────────────────────
    data     = []
    max_rows = max(len(earning_rows), len(deduction_rows), 1)

    for i in range(max_rows):
        earn_comp, earn_amt = earning_rows[i]   if i < len(earning_rows)   else ("", None)
        ded_comp,  ded_amt  = deduction_rows[i] if i < len(deduction_rows) else ("", None)

        data.append({
            "description":     earn_comp,
            "amount":          flt(earn_amt, 2) if earn_comp else None,
            "spacer":          "",
            "ded_description": ded_comp,
            "ded_amount":      flt(ded_amt, 2)  if ded_comp  else None,
            "_row_type":       "component",
        })

    # Grand total
    data.append({
        "description":     "Grand Total",
        "amount":          flt(grand_earn, 2),
        "spacer":          "",
        "ded_description": "Grand Total",
        "ded_amount":      flt(grand_ded, 2),
        "bold":            1,
        "_row_type":       "grand_total",
    })

    # Separator
    data.append({
        "description": "", "amount": None,
        "spacer": "", "ded_description": "", "ded_amount": None,
        "_row_type": "separator",
    })

    # Other Details header
    data.append({
        "description": "Other Details", "amount": None,
        "spacer": "", "ded_description": "", "ded_amount": None,
        "bold": 1, "_row_type": "section_header",
    })

    for label, value in [
        ("Total Employees",    stats.get("total_employees") or 0),
        ("Total Net Salary",   flt(stats.get("total_net_salary"), 2)),
        ("Total LWP Days",     flt(stats.get("total_lwp"), 2)),
        ("Total Absent Days",  flt(stats.get("total_absent"), 2)),
        ("Total Holidays",     flt(stats.get("total_holidays"), 2)),
        ("Total Payment Days", flt(stats.get("total_payment_days"), 2)),
    ]:
        data.append({
            "description":     label,
            "amount":          value,
            "spacer":          "",
            "ded_description": "",
            "ded_amount":      None,
            "_row_type":       "other",
        })

    return data