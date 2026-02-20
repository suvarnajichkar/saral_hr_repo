import frappe
from frappe import _
import calendar
from frappe.utils import flt

MONTH_MAP = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12
}


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "label": _("Employee ID"),
            "fieldname": "employee_id",
            "fieldtype": "Data",
            "width": 130
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": _("IFSC Code"),
            "fieldname": "ifsc_code",
            "fieldtype": "Data",
            "width": 130
        },
        {
            "label": _("Account Number"),
            "fieldname": "account_number",
            "fieldtype": "Data",
            "width": 160
        },
        {
            "label": _("Net Salary"),
            "fieldname": "net_salary",
            "fieldtype": "Float",
            "precision": 2,
            "width": 130
        },
        {
            "label": _("Bank Name"),
            "fieldname": "bank_name",
            "fieldtype": "Data",
            "width": 150
        },
    ]


def get_company_home_banks(companies):
    if not companies:
        return {}
    records = frappe.db.get_all(
        "Company",
        filters={"name": ["in", companies]},
        fields=["name", "bank_name"]
    )
    return {r.name: (r.bank_name or "").strip().lower() for r in records}


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

    # Company — MultiSelectList
    companies = []
    if filters.get("company"):
        companies = frappe.parse_json(filters.get("company"))
        if companies:
            sql_filters["companies"] = tuple(companies)
            conditions += " AND ss.company IN %(companies)s"

    # Employee — MultiSelectList
    if filters.get("employee"):
        employees = frappe.parse_json(filters.get("employee"))
        if employees:
            sql_filters["employees"] = tuple(employees)
            conditions += " AND ss.employee IN %(employees)s"

    # Category filter — Company Link se INNER JOIN
    category_join = ""
    if filters.get("category"):
        categories = frappe.parse_json(filters.get("category"))
        if categories:
            category_join = "INNER JOIN `tabCompany Link` cl_cat ON cl_cat.employee = ss.employee"
            sql_filters["categories"] = tuple(categories)
            conditions += " AND cl_cat.category IN %(categories)s"

    salary_slips = frappe.db.sql(f"""
        SELECT
            ss.employee        AS employee,
            ss.employee_name   AS employee_name,
            ss.company         AS company,
            ss.net_salary      AS net_salary,
            emp.bank_name      AS bank_name,
            emp.account_number AS account_number,
            emp.ifsc_code      AS ifsc_code
        FROM
            `tabSalary Slip` ss
        LEFT JOIN
            `tabCompany Link` cl ON cl.name = ss.employee
        LEFT JOIN
            `tabEmployee` emp ON emp.name = cl.employee
        {category_join}
        WHERE
            {conditions}
        ORDER BY
            ss.employee_name ASC
    """, sql_filters, as_dict=True)

    if not salary_slips:
        return []

    all_companies = list({slip.company for slip in salary_slips if slip.company})
    home_bank_map = get_company_home_banks(all_companies)

    bank_type = filters.get("bank_type")

    data = []
    total_net = 0

    for slip in salary_slips:
        emp_bank  = (slip.bank_name or "").strip().lower()
        home_bank = home_bank_map.get(slip.company, "")

        if bank_type == "Home":
            if not home_bank or emp_bank != home_bank:
                continue
        elif bank_type == "Different":
            if home_bank and emp_bank == home_bank:
                continue

        net = flt(slip.net_salary, 2)
        total_net += net

        data.append({
            "employee_id":    slip.employee,
            "employee_name":  slip.employee_name,
            "ifsc_code":      slip.ifsc_code or "-",
            "account_number": slip.account_number or "-",
            "net_salary":     net,
            "bank_name":      slip.bank_name or "-",
        })

    # Total row
    data.append({
        "employee_id":    "",
        "employee_name":  "Total",
        "ifsc_code":      "",
        "account_number": "",
        "net_salary":     flt(total_net, 2),
        "bank_name":      "",
        "bold":           1,
    })

    return data


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