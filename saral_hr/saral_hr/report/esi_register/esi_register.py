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
            "fieldname": "esic_number",
            "label": _("ESI Number"),
            "fieldtype": "Data",
            "width": 160,
        },
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
            "fieldname": "days_paid",
            "label": _("Days Paid"),
            "fieldtype": "Float",
            "precision": 2,
            "width": 100,
        },
        {
            "fieldname": "gross_salary",
            "label": _("Gross Salary"),
            "fieldtype": "Float",
            "precision": 2,
            "width": 150,
        },
        {
            "fieldname": "total_esi",
            "label": _("ESI Contribution"),
            "fieldtype": "Float",
            "precision": 2,
            "width": 160,
        },
        {
            "fieldname": "date_of_joining",
            "label": _("Join Date"),
            "fieldtype": "Date",
            "width": 120,
        },
        {
            "fieldname": "date_of_birth",
            "label": _("Birth Date"),
            "fieldtype": "Date",
            "width": 120,
        },
    ]


def get_conditions(filters):
    conditions = ""

    if not filters:
        return conditions

    # Company - required
    if filters.get("company"):
        conditions += " AND ss.company = %(company)s"

    # Year + Month - required, build exact start_date from salary slip
    if filters.get("year") and filters.get("month"):
        month_map = {
            'January': 1,   'February': 2,  'March': 3,
            'April': 4,     'May': 5,        'June': 6,
            'July': 7,      'August': 8,     'September': 9,
            'October': 10,  'November': 11,  'December': 12
        }
        month_num = month_map.get(filters.get("month"))
        if month_num:
            start_date = "{}-{:02d}-01".format(filters.get("year"), month_num)
            conditions += " AND ss.start_date = '{}'".format(start_date)

    return conditions


def get_data(filters):
    # Return empty silently until user selects filters
    if not filters or not filters.get("company"):
        return []
    if not filters.get("year") or not filters.get("month"):
        return []

    conditions = get_conditions(filters)

    salary_slips = frappe.db.sql(
        """
        SELECT
            ss.name            AS salary_slip,
            ss.employee        AS employee,
            ss.employee_name   AS employee_name,
            ss.payment_days    AS days_paid,
            ss.total_earnings  AS gross_salary,
            cl.employee        AS employee_id,
            cl.date_of_joining AS date_of_joining,
            emp.date_of_birth  AS date_of_birth,
            emp.esic_number    AS esic_number
        FROM
            `tabSalary Slip` ss
        LEFT JOIN
            `tabCompany Link` cl  ON cl.name = ss.employee
        LEFT JOIN
            `tabEmployee` emp     ON emp.name = cl.employee
        WHERE
            ss.docstatus = 1
            {conditions}
        ORDER BY
            ss.employee_name, ss.start_date
        """.format(conditions=conditions),
        filters or {},
        as_dict=1,
    )

    if not salary_slips:
        return []

    slip_names = [s.salary_slip for s in salary_slips]

    # Fetch all ESIC deduction rows and sum per slip
    esi_rows = frappe.db.sql(
        """
        SELECT
            sd.parent   AS salary_slip,
            sd.amount   AS amount
        FROM
            `tabSalary Details` sd
        WHERE
            sd.parent IN %(slip_names)s
            AND sd.parentfield = 'deductions'
            AND LOWER(sd.salary_component) LIKE '%%esic%%'
            AND sd.amount > 0
        """,
        {"slip_names": slip_names},
        as_dict=1,
    )

    # Map: salary_slip -> total ESI (employee + employer combined)
    esi_map = {}
    for row in esi_rows:
        esi_map[row.salary_slip] = esi_map.get(row.salary_slip, 0.0) + flt(row.amount)

    data = []
    for slip in salary_slips:
        total_esi = flt(esi_map.get(slip.salary_slip, 0))

        # Skip employees with no ESI (gross > 21000 threshold)
        if total_esi == 0:
            continue

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

    return data