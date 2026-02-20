import frappe
from frappe import _
import calendar
from frappe.utils import flt

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
            "label": _("Employee ID"),
            "fieldname": "employee",
            "fieldtype": "Data",
            "width": 120
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": _("Payment Days"),
            "fieldname": "payment_days",
            "fieldtype": "Float",
            "precision": 2,
            "width": 110
        },
    ]

    # Earning columns
    for label, abbr in EARNING_COMPONENTS:
        columns.append({
            "label": _(f"{label} ({abbr})"),
            "fieldname": f"earn_{sanitize(abbr)}",
            "fieldtype": "Float",
            "precision": 2,
            "width": 150
        })

    # Deduction columns
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


def get_data(filters):
    year  = filters.get("year")
    month = filters.get("month")

    if not year or not month:
        return []

    year  = int(year)
    month = MONTH_MAP.get(month)
    if not month:
        return []

    last_day   = calendar.monthrange(year, month)[1]
    start_date = f"{year}-{str(month).zfill(2)}-01"
    end_date   = f"{year}-{str(month).zfill(2)}-{str(last_day).zfill(2)}"

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

    # Category filter — MultiSelectList, Company Link se INNER JOIN
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
            ss.net_salary    AS net_salary
        FROM
            `tabSalary Slip` ss
            {category_join}
        WHERE
            {conditions}
        ORDER BY
            ss.employee_name ASC
    """, sql_filters, as_dict=True)

    if not salary_slips:
        return []

    slip_names = [d["salary_slip"] for d in salary_slips]

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

    # Totals tracker
    grand = {
        "total_earnings": 0,
        "total_deductions": 0,
        "net_salary": 0,
    }
    for _, abbr in EARNING_COMPONENTS:
        grand[f"earn_{sanitize(abbr)}"] = 0
    for _, abbr in DEDUCTION_COMPONENTS:
        grand[f"ded_{sanitize(abbr)}"] = 0

    for slip in salary_slips:
        slip_earnings   = earnings_map.get(slip["salary_slip"], {})
        slip_deductions = deductions_map.get(slip["salary_slip"], {})

        row = {
            "salary_slip":   slip["salary_slip"],
            "employee":      slip["employee"],
            "employee_name": slip["employee_name"],
            "payment_days":  flt(slip["payment_days"], 2),
            "net_salary":    flt(slip["net_salary"], 2),
        }

        total_earn = 0
        for label, abbr in EARNING_COMPONENTS:
            amount = slip_earnings.get(label)
            if amount is not None:
                val = flt(amount, 2)
                row[f"earn_{sanitize(abbr)}"] = val
                total_earn += val
                grand[f"earn_{sanitize(abbr)}"] += val

        row["total_earnings"] = flt(total_earn, 2)
        grand["total_earnings"] += flt(total_earn, 2)

        total_ded = 0
        for label, abbr in DEDUCTION_COMPONENTS:
            amount = slip_deductions.get(label)
            if amount is not None:
                val = flt(amount, 2)
                row[f"ded_{sanitize(abbr)}"] = val
                total_ded += val
                grand[f"ded_{sanitize(abbr)}"] += val

        row["total_deductions"] = flt(total_ded, 2)
        grand["total_deductions"] += flt(total_ded, 2)
        grand["net_salary"] += flt(slip["net_salary"], 2)

        data.append(row)

    # Grand Total row
    total_row = {
        "employee":      "",
        "employee_name": "Total",
        "payment_days":  "",
        "bold":          1,
    }
    total_row.update(grand)
    data.append(total_row)

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