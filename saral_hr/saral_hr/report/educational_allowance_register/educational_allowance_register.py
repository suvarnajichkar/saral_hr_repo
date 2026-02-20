import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "fieldname": "employee_id",
            "label": _("Employee ID"),
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "fieldname": "employee_name",
            "label": _("Employee Name"),
            "fieldtype": "Data",
            "width": 200,
        },
        {
            "fieldname": "educational_allowance",
            "label": _("Educational Allowance"),
            "fieldtype": "Float",
            "precision": 2,
            "width": 180,
        },
    ]


def get_data(filters):
    if not filters:
        return []
    if not filters.get("year") or not filters.get("month"):
        return []
    if not filters.get("company"):
        return []

    month_map = {
        'January': 1,   'February': 2,  'March': 3,
        'April': 4,     'May': 5,        'June': 6,
        'July': 7,      'August': 8,     'September': 9,
        'October': 10,  'November': 11,  'December': 12
    }
    month_num = month_map.get(filters.get("month"))
    if not month_num:
        return []

    start_date = "{}-{:02d}-01".format(filters.get("year"), month_num)

    query_params = {"start_date": start_date}
    conditions = ""

    # Company — MultiSelectList
    companies = frappe.parse_json(filters.get("company"))
    if companies:
        query_params["companies"] = tuple(companies)
        conditions += " AND ss.company IN %(companies)s"

    # Employee — MultiSelectList (optional)
    if filters.get("employee"):
        employees = frappe.parse_json(filters.get("employee"))
        if employees:
            query_params["employees"] = tuple(employees)
            conditions += " AND ss.employee IN %(employees)s"

    # Category filter — Company Link se INNER JOIN
    category_join = ""
    if filters.get("category"):
        categories = frappe.parse_json(filters.get("category"))
        if categories:
            category_join = "INNER JOIN `tabCompany Link` cl_cat ON cl_cat.employee = ss.employee"
            query_params["categories"] = tuple(categories)
            conditions += " AND cl_cat.category IN %(categories)s"

    salary_slips = frappe.db.sql(
        f"""
        SELECT
            ss.name          AS salary_slip,
            ss.employee      AS employee,
            ss.employee_name AS employee_name,
            cl.employee      AS employee_id
        FROM
            `tabSalary Slip` ss
        LEFT JOIN
            `tabCompany Link` cl ON cl.name = ss.employee
        {category_join}
        WHERE
            ss.docstatus = 1
            AND ss.start_date = %(start_date)s
            {conditions}
        ORDER BY
            ss.employee_name
        """,
        query_params,
        as_dict=1,
    )

    if not salary_slips:
        return []

    slip_names = [s.salary_slip for s in salary_slips]

    ea_rows = frappe.db.sql(
        """
        SELECT
            sd.parent AS salary_slip,
            sd.amount AS amount
        FROM
            `tabSalary Details` sd
        WHERE
            sd.parent IN %(slip_names)s
            AND sd.parentfield = 'earnings'
            AND LOWER(sd.salary_component) LIKE '%%education%%'
            AND sd.amount > 0
        """,
        {"slip_names": tuple(slip_names)},
        as_dict=1,
    )

    ea_map = {}
    for row in ea_rows:
        ea_map[row.salary_slip] = ea_map.get(row.salary_slip, 0.0) + flt(row.amount)

    data = []
    grand_total = 0

    for slip in salary_slips:
        edu_allowance = flt(ea_map.get(slip.salary_slip, 0))
        if edu_allowance == 0:
            continue

        grand_total += edu_allowance
        data.append({
            "employee_id":           slip.employee_id or slip.employee,
            "employee_name":         slip.employee_name,
            "educational_allowance": edu_allowance,
        })

    # Grand Total row
    if data:
        data.append({
            "employee_id":           "",
            "employee_name":         "Total",
            "educational_allowance": flt(grand_total, 2),
            "bold": 1,
        })

    return data


@frappe.whitelist()
def get_ea_employees_for_filter(companies=None, txt=""):

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
        INNER JOIN
            `tabSalary Details` sd
            ON  sd.parent      = ss.name
            AND sd.parentfield = 'earnings'
            AND LOWER(sd.salary_component) LIKE '%%education%%'
            AND sd.amount > 0
        WHERE
            ss.docstatus = 1
            AND (ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)
            {company_condition}
        ORDER BY ss.employee_name
        LIMIT 50
    """.format(company_condition=company_condition), params, as_dict=1)

    return results