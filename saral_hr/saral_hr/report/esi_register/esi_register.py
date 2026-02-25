import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {"fieldname": "esic_number",    "label": _("ESI Number"),      "fieldtype": "Data",  "width": 150},
        {"fieldname": "employee_id",    "label": _("Employee ID"),      "fieldtype": "Data",  "width": 120},
        {"fieldname": "employee_name",  "label": _("Employee Name"),    "fieldtype": "Data",  "width": 200},
        {"fieldname": "days_paid",      "label": _("Days Paid"),        "fieldtype": "Float", "precision": 2, "width": 100},
        {"fieldname": "gross_salary",   "label": _("Gross Salary"),     "fieldtype": "Float", "precision": 2, "width": 140},
        {"fieldname": "total_esi",      "label": _("ESI Contribution"), "fieldtype": "Float", "precision": 2, "width": 140},
        {"fieldname": "date_of_joining","label": _("Join Date"),        "fieldtype": "Date",  "width": 110},
        {"fieldname": "date_of_birth",  "label": _("Birth Date"),       "fieldtype": "Date",  "width": 110},
    ]


def get_conditions(filters):
    conditions = ""

    if filters.get("company"):
        companies = frappe.parse_json(filters.get("company"))
        filters["companies"] = tuple(companies)
        conditions += " AND ss.company IN %(companies)s"

    if filters.get("employee"):
        employees = frappe.parse_json(filters.get("employee"))
        filters["employees"] = tuple(employees)
        conditions += " AND ss.employee IN %(employees)s"

    if filters.get("year") and filters.get("month"):
        month_map = {
            "January": 1, "February": 2, "March": 3, "April": 4,
            "May": 5, "June": 6, "July": 7, "August": 8,
            "September": 9, "October": 10, "November": 11, "December": 12
        }
        month_num = month_map.get(filters.get("month"))
        if month_num:
            start_date = "{}-{:02d}-01".format(filters.get("year"), month_num)
            filters["start_date"] = start_date
            conditions += " AND ss.start_date = %(start_date)s"

    return conditions


def get_data(filters):
    if not filters.get("year") or not filters.get("month"):
        return []
    if not filters.get("company"):
        return []

    conditions = get_conditions(filters)

    # Category filter — Company Link se INNER JOIN
    category_join = ""
    if filters.get("category"):
        categories = frappe.parse_json(filters.get("category"))
        if categories:
            category_join = "INNER JOIN `tabCompany Link` cl_cat ON cl_cat.employee = ss.employee"
            filters["categories"] = tuple(categories)
            conditions += " AND cl_cat.category IN %(categories)s"

    salary_slips = frappe.db.sql(
        f"""
        SELECT
            ss.name            AS salary_slip,
            ss.employee        AS employee,
            ss.employee_name   AS employee_name,
            ss.payment_days    AS days_paid,
            ss.total_earnings  AS gross_salary,
            emp.name           AS employee_id,
            emp.date_of_joining,
            emp.date_of_birth,
            emp.esic_number
        FROM
            `tabSalary Slip` ss
        LEFT JOIN
            `tabEmployee` emp ON emp.name = ss.employee
        {category_join}
        WHERE
            ss.docstatus = 1
            {conditions}
        ORDER BY
            ss.employee_name
        """,
        filters,
        as_dict=1,
    )

    if not salary_slips:
        return []

    slip_names = [d.salary_slip for d in salary_slips]

    esi_rows = frappe.db.sql(
        """
        SELECT sd.parent AS salary_slip, sd.amount
        FROM `tabSalary Details` sd
        WHERE
            sd.parent IN %(slip_names)s
            AND sd.parentfield = 'deductions'
            AND LOWER(sd.salary_component) LIKE '%%esic%%'
            AND sd.amount > 0
        """,
        {"slip_names": tuple(slip_names)},
        as_dict=1,
    )

    esi_map = {}
    for row in esi_rows:
        esi_map[row.salary_slip] = esi_map.get(row.salary_slip, 0) + flt(row.amount)

    data = []
    grand_gross = 0
    grand_esi   = 0

    for slip in salary_slips:
        total_esi = flt(esi_map.get(slip.salary_slip, 0))
        if total_esi <= 0:
            continue

        grand_gross += flt(slip.gross_salary, 2)
        grand_esi   += total_esi

        data.append({
            "esic_number":     slip.esic_number or "-",
            "employee_id":     slip.employee_id or slip.employee,
            "employee_name":   slip.employee_name,
            "days_paid":       flt(slip.days_paid, 2),
            "gross_salary":    flt(slip.gross_salary, 2),
            "total_esi":       total_esi,
            "date_of_joining": slip.date_of_joining,
            "date_of_birth":   slip.date_of_birth,
        })

    if data:
        data.append({
            "esic_number":     "",
            "employee_id":     "",
            "employee_name":   "Total",
            "days_paid":       "",
            "gross_salary":    flt(grand_gross, 2),
            "total_esi":       flt(grand_esi, 2),
            "date_of_joining": "",
            "date_of_birth":   "",
            "bold": 1,
        })

    return data


@frappe.whitelist()
def get_esi_employees_for_filter(companies=None, txt=""):
    companies = frappe.parse_json(companies) if companies else []
    company_condition = ""
    params = {"txt": f"%{txt}%"}

    if companies:
        company_condition = "AND ss.company IN %(companies)s"
        params["companies"] = tuple(companies)

    results = frappe.db.sql("""
        SELECT DISTINCT
            ss.employee       AS employee,
            ss.employee_name  AS employee_name
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parentfield = 'deductions'
            AND LOWER(sd.salary_component) LIKE '%%esic%%'
            AND sd.amount > 0
        WHERE
            ss.docstatus = 1
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(company_condition=company_condition), params, as_dict=1)

    return results