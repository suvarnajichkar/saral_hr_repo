# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt
import math

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}

PF_WAGE_CEILING = 15000.0


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
        {"label": "PF No.",             "fieldname": "pf_no",          "fieldtype": "Data",     "width": 110},
        {"label": "UAN No.",            "fieldname": "uan_no",          "fieldtype": "Data",     "width": 110},
        {"label": "Employee ID",        "fieldname": "employee_id",    "fieldtype": "Data",     "width": 120},
        {"label": "Employee Name",      "fieldname": "employee_name",  "fieldtype": "Data",     "width": 180},
        {"label": "Days (LWP+ABS)",     "fieldname": "days",           "fieldtype": "Float",    "width": 80,  "precision": 1},
        {"label": "Absent",             "fieldname": "absent",         "fieldtype": "Float",    "width": 65,  "precision": 1},
        {"label": "Gross Salary",       "fieldname": "gross",          "fieldtype": "Float", "width": 110, "precision": 2},
        {"label": "BS+DA (AR+CO)",      "fieldname": "basic_da",       "fieldtype": "Float", "width": 110, "precision": 2},
        {"label": "Employee PF 12%",    "fieldname": "emp_pf",         "fieldtype": "Float", "width": 110, "precision": 2},
        {"label": "Employer EPS 8.33%", "fieldname": "employer_eps",   "fieldtype": "Float", "width": 120, "precision": 2},
        {"label": "Employer PF 3.67%",  "fieldname": "employer_pf",    "fieldtype": "Float", "width": 120, "precision": 2},
        {"label": "Total Amount",       "fieldname": "total_amount",   "fieldtype": "Float", "width": 105, "precision": 2},
        {"label": "Non-Cont.",          "fieldname": "non_contrib",    "fieldtype": "Float", "width": 100, "precision": 2},
        {"label": "Vol. PF",            "fieldname": "vol_pf",         "fieldtype": "Float", "width": 80,  "precision": 2},
        {"label": "Cumul. PF",          "fieldname": "cumul_pf",       "fieldtype": "Float", "width": 95,  "precision": 2},
        {"label": "Cumul. EPS",         "fieldname": "cumul_eps",      "fieldtype": "Float", "width": 95,  "precision": 2},
        {"label": "Total Amount",       "fieldname": "total_amount2",  "fieldtype": "Float", "width": 105, "precision": 2},
        {"label": "Date of Joining",    "fieldname": "date_of_joining","fieldtype": "Date",     "width": 105},
        {"label": "Date of Birth",      "fieldname": "date_of_birth",  "fieldtype": "Date",     "width": 100},
    ]


def get_data(filters):
    import json

    month          = filters.get("month")
    year           = filters.get("year")
    category       = filters.get("category")       # single string (Link field)
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

    # Category filter via Company Link (same pattern as all other reports)
    category_join = ""
    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON  cl.name     = ss.employee
                AND cl.category = %(category)s
        """
        query_params["category"] = category

    where_sql = " AND ".join(where_clauses)

    # ── Salary slip base data ──────────────────────────────────────────────
    slips = frappe.db.sql("""
        SELECT
            ss.name           AS slip_name,
            ss.employee       AS employee_id,
            ss.employee_name  AS employee_name,
            ss.payment_days   AS days,
            ss.absent_days    AS absent,
            ss.total_earnings AS gross
        FROM `tabSalary Slip` ss
        {category_join}
        WHERE {where}
        ORDER BY ss.employee_name
    """.format(where=where_sql, category_join=category_join), query_params, as_dict=1)

    if not slips:
        return []

    slip_names = tuple(s.slip_name for s in slips)

    # ── Basic + DA from earnings ───────────────────────────────────────────
    basic_da_rows = frappe.db.sql("""
        SELECT
            sd.parent AS slip_name,
            SUM(sd.amount) AS basic_da
        FROM `tabSalary Details` sd
        WHERE sd.parent IN %(slip_names)s
          AND sd.parenttype  = 'Salary Slip'
          AND sd.parentfield = 'earnings'
          AND (
              LOWER(sd.salary_component) LIKE %(like_basic)s
              OR LOWER(sd.salary_component) LIKE %(like_da)s
              OR LOWER(sd.salary_component) LIKE %(like_dear)s
          )
        GROUP BY sd.parent
    """, {
        "slip_names": slip_names,
        "like_basic": "%basic%",
        "like_da":    "%dearness%",
        "like_dear":  "% da",
    }, as_dict=1)

    basic_da_map = {r.slip_name: flt(r.basic_da) for r in basic_da_rows}

    # ── Voluntary PF from deductions ──────────────────────────────────────
    vpf_rows = frappe.db.sql("""
        SELECT
            sd.parent AS slip_name,
            SUM(sd.amount) AS vol_pf
        FROM `tabSalary Details` sd
        WHERE sd.parent IN %(slip_names)s
          AND sd.parenttype  = 'Salary Slip'
          AND sd.parentfield = 'deductions'
          AND LOWER(sd.salary_component) LIKE %(like_vpf)s
        GROUP BY sd.parent
    """, {
        "slip_names": slip_names,
        "like_vpf":   "%voluntary%",
    }, as_dict=1)

    vpf_map = {r.slip_name: flt(r.vol_pf) for r in vpf_rows}

    # ── Employee master: PF No, UAN, DOJ, DOB ─────────────────────────────
    employee_ids = tuple(s.employee_id for s in slips)

    emp_rows = frappe.db.sql("""
        SELECT
            e.name,
            e.employee_pf_account  AS pf_no,
            e.pf_uan_number        AS uan_no,
            e.date_of_birth,
            cl.date_of_joining
        FROM `tabEmployee` e
        LEFT JOIN `tabCompany Link` cl ON cl.name = e.name
        WHERE e.name IN %(employee_ids)s
    """, {"employee_ids": employee_ids}, as_dict=1)

    emp_map = {r.name: r for r in emp_rows}

    # ── Build rows ─────────────────────────────────────────────────────────
    data           = []
    t_gross        = 0.0
    t_basic_da     = 0.0
    t_emp_pf       = 0.0
    t_er_eps       = 0.0
    t_er_pf        = 0.0
    t_total        = 0.0
    t_nc           = 0.0
    t_vpf          = 0.0
    t_cumul_pf     = 0.0
    t_cumul_eps    = 0.0
    t_total2       = 0.0

    for idx, slip in enumerate(slips, start=1):
        emp        = emp_map.get(slip.employee_id, frappe._dict())
        gross      = flt(slip.gross, 2)
        actual_bda = flt(basic_da_map.get(slip.slip_name, 0.0), 2)

        # PF wage capped at 15,000
        pf_wage    = min(actual_bda, PF_WAGE_CEILING)

        # Employee PF = 12% of pf_wage (rounded)
        emp_pf     = flt(round(pf_wage * 0.12), 2)

        # Employer EPS = round(emp_pf × 0.6944)  [8.33/12]
        er_eps     = flt(round(emp_pf * 0.6944), 2)

        # Employer PF diff = round(emp_pf × 0.3056)  [3.67/12]
        er_pf      = flt(round(emp_pf * 0.3056), 2)

        # Total = emp_pf + emp_pf
        total_amt  = flt(emp_pf + emp_pf, 2)

        # Non-Contributory = max(0, actual BS+DA - 15000)
        non_contrib = flt(max(0.0, actual_bda - PF_WAGE_CEILING), 2)

        # Voluntary PF
        vol_pf     = flt(vpf_map.get(slip.slip_name, 0.0), 2)

        # Cumul PF = emp_pf + er_pf (current month only)
        cumul_pf   = flt(emp_pf + er_pf, 2)

        # Cumul EPS = er_eps (current month only)
        cumul_eps  = flt(er_eps, 2)

        # Total Amount col 2 = same as total_amt
        total_amt2 = total_amt

        t_gross     += gross
        t_basic_da  += actual_bda
        t_emp_pf    += emp_pf
        t_er_eps    += er_eps
        t_er_pf     += er_pf
        t_total     += total_amt
        t_nc        += non_contrib
        t_vpf       += vol_pf
        t_cumul_pf  += cumul_pf
        t_cumul_eps += cumul_eps
        t_total2    += total_amt2

        data.append({
            "pf_no":          emp.get("pf_no") or "",
            "uan_no":         emp.get("uan_no") or "",
            "employee_id":    slip.employee_id,
            "employee_name":  slip.employee_name,
            "days":           flt(slip.days, 1),
            "absent":         flt(slip.absent, 1),
            "gross":          gross,
            "basic_da":       actual_bda,
            "emp_pf":         emp_pf,
            "employer_eps":   er_eps,
            "employer_pf":    er_pf,
            "total_amount":   total_amt,
            "non_contrib":    non_contrib,
            "vol_pf":         vol_pf if vol_pf else None,
            "cumul_pf":       cumul_pf,
            "cumul_eps":      cumul_eps,
            "total_amount2":  total_amt2,
            "date_of_joining":emp.get("date_of_joining") or "",
            "date_of_birth":  emp.get("date_of_birth") or "",
            "_row_type":      "detail",
        })

    # Grand total
    data.append({
        "pf_no":          "",
        "uan_no":         "",
        "employee_id":    "",
        "employee_name":  "Total",
        "days":           None,
        "absent":         None,
        "gross":          flt(t_gross, 2),
        "basic_da":       flt(t_basic_da, 2),
        "emp_pf":         flt(t_emp_pf, 2),
        "employer_eps":   flt(t_er_eps, 2),
        "employer_pf":    flt(t_er_pf, 2),
        "total_amount":   flt(t_total, 2),
        "non_contrib":    flt(t_nc, 2),
        "vol_pf":         flt(t_vpf, 2) if t_vpf else None,
        "cumul_pf":       flt(t_cumul_pf, 2),
        "cumul_eps":      flt(t_cumul_eps, 2),
        "total_amount2":  flt(t_total2, 2),
        "date_of_joining": "",
        "date_of_birth":   "",
        "bold":            1,
        "_row_type":       "total",
    })

    return data


# Here are the column calculations in clear points:
# 1. Employee PF (12%)

# round(pf_wage × 0.12)
# where pf_wage = min(actual BS+DA, 15,000)

# 2. Employer EPS (8.33%)

# round(emp_pf × 0.6944)
# 0.6944 = 8.33 ÷ 12

# 3. Employer PF (3.67%)

# round(emp_pf × 0.3056)
# 0.3056 = 3.67 ÷ 12

# 4. Total Amount

# emp_pf + emp_pf
# Employee contribution + Employer total (both sides equal emp_pf)

# 5. Non-Contributory

# max(0, actual BS+DA − 15,000)
# Only the salary portion above the ₹15,000 PF ceiling

# 6. Voluntary PF

# Actual amount of deduction component named like %voluntary% from the salary slip

# 7. Cumul. PF

# emp_pf + employer_pf (current month only, not a running total across months)

# 8. Cumul. EPS

# employer_eps (current month only)

# 9. Total Amount (2nd col)

# Same as Total Amount — emp_pf + emp_pf