import frappe
from frappe import _
import calendar

MONTH_MAP = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12
}

EARNING_COMPONENTS = [
    ("Basic", "BASIC"),
    ("Dearness Allowance", "DA"),
    ("House Rent Allowance", "HRA"),
    ("Conveyance Allowance", "CONV"),
    ("Medical Allowance", "MED"),
    ("Education Allowance", "EDU"),
    ("Other Allowance", "OA"),
    ("Variable Pay", "VAR"),
    ("Arrears", "ARREARS"),
]

DEDUCTION_COMPONENTS = [
    ("Employee -  PF", "PF"),
    ("Employer -  PF", "EPF"),
    ("Employee - ESIC", "ESI"),
    ("Employer -  ESIC", "EESI"),
    ("Professional Tax", "PT"),
    ("Employee -Labour Welfare Fund", "Employee - LWF"),
    ("Employer - Labour Welfare Fund", "Employer - LWF"),
    ("Employee -Bonus", "BONUS"),
    ("Employer - Bonus", "Employer - bonus"),
    ("Employer - Gratuity", "GRAT"),
    ("Loan", "Loan"),
    ("Advance", "ADV"),
    ("Retention", "RET"),
    ("Other Deduction - 1", "OD -1"),
]


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    columns = [
        {
            "label": _("Employee"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 120
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 160
        },
        {
            "label": _("Payment Days"),
            "fieldname": "payment_days",
            "fieldtype": "Float",
            "precision": 2,
            "width": 110
        },
        {
            "label": _("LWP"),
            "fieldname": "total_lwp",
            "fieldtype": "Float",
            "precision": 2,
            "width": 100
        },
    ]

    for label, abbr in EARNING_COMPONENTS:
        if abbr == "VAR":
            columns.append({
                "label": _("Variable Pay (VAR %)"),
                "fieldname": "earn_var",
                "fieldtype": "Data",
                "width": 150
            })
        else:
            columns.append({
                "label": _(f"{label} ({abbr})"),
                "fieldname": f"earn_{sanitize(abbr)}",
                "fieldtype": "Float",
                "precision": 2,
                "width": 150
            })

    for label, abbr in DEDUCTION_COMPONENTS:
        columns.append({
            "label": _(f"{label} ({abbr})"),
            "fieldname": f"ded_{sanitize(abbr)}",
            "fieldtype": "Float",
            "precision": 2,
            "width": 150
        })

    columns.append({
        "label": _("Total Earnings"),
        "fieldname": "total_earnings",
        "fieldtype": "Float",
        "precision": 2,
        "width": 140
    })

    columns.append({
        "label": _("Total Deductions"),
        "fieldname": "total_deductions",
        "fieldtype": "Float",
        "precision": 2,
        "width": 140
    })
    columns.append({
        "label": _("Net Salary"),
        "fieldname": "net_salary",
        "fieldtype": "Float",
        "precision": 2,
        "width": 140
    })

    return columns


def get_variable_pay_percentage_map(year, month):
    doc_name = f"{year} - {month}"

    rows = frappe.db.sql("""
        SELECT
            vpd.division   AS division,
            vpd.percentage AS percentage
        FROM
            `tabVariable Pay Detail Table` vpd
        WHERE
            vpd.parent = %(doc_name)s
            AND vpd.parentfield = 'variable_pay'
    """, {"doc_name": doc_name}, as_dict=True)

    return {r.division: r.percentage for r in rows}


def get_employee_division_map(employee_ids):
    if not employee_ids:
        return {}

    rows = frappe.db.sql("""
        SELECT
            cl.name     AS company_link_name,
            cl.division AS division
        FROM
            `tabCompany Link` cl
        WHERE
            cl.name IN %(employees)s
    """, {"employees": tuple(employee_ids)}, as_dict=True)

    return {r.company_link_name: r.division for r in rows}


def get_data(filters):
    year  = filters.get("year")
    month = filters.get("month")

    if not year or not month:
        return []

    year_int  = int(year)
    month_num = MONTH_MAP.get(month)

    if not month_num:
        return []

    last_day   = calendar.monthrange(year_int, month_num)[1]
    start_date = f"{year_int}-{str(month_num).zfill(2)}-01"
    end_date   = f"{year_int}-{str(month_num).zfill(2)}-{str(last_day).zfill(2)}"

    conditions  = "ss.docstatus = 1 AND ss.start_date >= %(start_date)s AND ss.end_date <= %(end_date)s"
    sql_filters = {"start_date": start_date, "end_date": end_date}

    if filters.get("company"):
        companies = frappe.parse_json(filters.get("company"))
        if companies:
            sql_filters["companies"] = tuple(companies)
            conditions += " AND ss.company IN %(companies)s"

    if filters.get("employee"):
        employees = frappe.parse_json(filters.get("employee"))
        if employees:
            sql_filters["employees"] = tuple(employees)
            conditions += " AND ss.employee IN %(employees)s"

    # Category filter — MultiSelectList se multiple categories support
    category_join = ""
    if filters.get("category"):
        categories = frappe.parse_json(filters.get("category"))
        if categories:
            category_join = "INNER JOIN `tabCompany Link` cl_cat ON cl_cat.employee = ss.employee"
            sql_filters["categories"] = tuple(categories)
            conditions += " AND cl_cat.category IN %(categories)s"

    salary_slips = frappe.db.sql(f"""
        SELECT
            ss.name          AS salary_slip,
            ss.employee      AS employee,
            ss.employee_name AS employee_name,
            ss.payment_days  AS payment_days,
            ss.total_lwp     AS total_lwp,
            ss.net_salary    AS net_salary
        FROM
            `tabSalary Slip` ss
            {category_join}
        WHERE
            {conditions}
        ORDER BY
            ss.employee ASC
    """, sql_filters, as_dict=True)

    if not salary_slips:
        return []

    slip_names   = [d["salary_slip"] for d in salary_slips]
    employee_ids = [d["employee"] for d in salary_slips]

    var_pct_map      = get_variable_pay_percentage_map(year, month)
    emp_division_map = get_employee_division_map(employee_ids)

    earnings_rows = frappe.db.sql("""
        SELECT
            sd.parent           AS salary_slip,
            sd.salary_component AS salary_component,
            sd.amount           AS amount
        FROM
            `tabSalary Details` sd
        WHERE
            sd.parent IN %(slips)s
            AND sd.parentfield = 'earnings'
    """, {"slips": slip_names}, as_dict=True)

    deductions_rows = frappe.db.sql("""
        SELECT
            sd.parent           AS salary_slip,
            sd.salary_component AS salary_component,
            sd.amount           AS amount
        FROM
            `tabSalary Details` sd
        WHERE
            sd.parent IN %(slips)s
            AND sd.parentfield = 'deductions'
    """, {"slips": slip_names}, as_dict=True)

    earnings_map   = {}
    deductions_map = {}

    for row in earnings_rows:
        earnings_map.setdefault(row["salary_slip"], {})[row["salary_component"]] = row["amount"]

    for row in deductions_rows:
        deductions_map.setdefault(row["salary_slip"], {})[row["salary_component"]] = row["amount"]

    data = []
    for slip in salary_slips:
        slip_earnings   = earnings_map.get(slip["salary_slip"], {})
        slip_deductions = deductions_map.get(slip["salary_slip"], {})

        division = emp_division_map.get(slip["employee"], "")
        var_pct  = var_pct_map.get(division)

        row = {
            "salary_slip":   slip["salary_slip"],
            "employee":      slip["employee"],
            "employee_name": slip["employee_name"],
            "payment_days":  slip["payment_days"],
            "total_lwp":     slip["total_lwp"] or 0,
            "net_salary":    slip["net_salary"],
        }

        total_earn = 0
        for label, abbr in EARNING_COMPONENTS:
            if abbr == "VAR":
                if var_pct is not None:
                    row["earn_var"] = f"{var_pct}%"
                else:
                    row["earn_var"] = "-"
                var_amount = slip_earnings.get(label)
                if var_amount:
                    total_earn += var_amount
            else:
                amount = slip_earnings.get(label)
                if amount is not None:
                    row[f"earn_{sanitize(abbr)}"] = amount
                    total_earn += amount

        row["total_earnings"] = total_earn if total_earn else None

        total_ded = 0
        for label, abbr in DEDUCTION_COMPONENTS:
            amount = slip_deductions.get(label)
            if amount is not None:
                row[f"ded_{sanitize(abbr)}"] = amount
                total_ded += amount

        row["total_deductions"] = total_ded if total_ded else None

        data.append(row)

    return data


def sanitize(abbr):
    return abbr.strip().lower().replace(" ", "_").replace("-", "_").replace("__", "_")


@frappe.whitelist()
def get_employees_for_filter(companies=None, txt=""):

    companies = frappe.parse_json(companies) if companies else []

    company_condition = ""
    params = {"txt": f"%{txt}%"}

    if companies:
        company_condition = "AND ss.company IN %(companies)s"
        params["companies"] = tuple(companies)

    results = frappe.db.sql("""
        SELECT DISTINCT
            ss.employee      AS employee,
            ss.employee_name AS employee_name
        FROM
            `tabSalary Slip` ss
        WHERE
            ss.docstatus = 1
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(company_condition=company_condition), params, as_dict=1)

    return results