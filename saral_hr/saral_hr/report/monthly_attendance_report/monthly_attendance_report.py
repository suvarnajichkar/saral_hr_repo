import frappe
import calendar
import json
from datetime import datetime


def execute(filters=None):
    if not filters:
        filters = {}

    columns = get_columns(filters)
    data    = get_data(filters)

    return columns, data


# ---------------------------------------------------------
# COLUMNS
# ---------------------------------------------------------

def get_columns(filters):
    if not filters.get("year") or not filters.get("month"):
        return []

    month_number  = list(calendar.month_name).index(filters.get("month"))
    days_in_month = calendar.monthrange(int(filters.get("year")), month_number)[1]

    columns = [
        {
            "label":     "Emp ID",
            "fieldname": "employee",
            "fieldtype": "Link",
            "options":   "Employee",
            "width":     130,
        },
        {
            "label":     "Employee Name",
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width":     180,
        },
    ]

    # Day columns next (01 … 31)
    for day in range(1, days_in_month + 1):
        columns.append({
            "label":     str(day),
            "fieldname": f"day_{day}",
            "fieldtype": "Data",
            "width":     45,
        })

    # Summary columns at the end
    columns += [
        {"label": "Working Days", "fieldname": "working_days",    "fieldtype": "Int",   "width": 95},
        {"label": "Present",      "fieldname": "present_days",    "fieldtype": "Float", "precision": 2, "width": 75},
        {"label": "Half Days",    "fieldname": "half_days",       "fieldtype": "Float", "precision": 2, "width": 75},
        {"label": "Absent",       "fieldname": "absent_days",     "fieldtype": "Float", "precision": 2, "width": 75},
        {"label": "Weekly Off",   "fieldname": "weekly_off_days", "fieldtype": "Int",   "width": 85},
        {"label": "Holiday",      "fieldname": "holiday_days",    "fieldtype": "Int",   "width": 70},
        {"label": "LWP",          "fieldname": "lwp_days",        "fieldtype": "Int",   "width": 60},
        {"label": "A + LWP",      "fieldname": "absent_lwp",      "fieldtype": "Float", "precision": 2, "width": 85},
    ]

    return columns


# ---------------------------------------------------------
# EMPLOYEE FILTER  (called from JS MultiSelectList)
# ---------------------------------------------------------

@frappe.whitelist()
def get_att_employees_for_filter(year, month, companies, category, txt=""):
    if isinstance(companies, str):
        companies = json.loads(companies)

    if not companies or not year or not month:
        return []

    month_number = list(calendar.month_name).index(month)
    yr        = int(year)
    from_date = datetime(yr, month_number, 1).date()
    last_day  = calendar.monthrange(yr, month_number)[1]
    to_date   = datetime(yr, month_number, last_day).date()

    values = {"from_date": from_date, "to_date": to_date, "txt": f"%{txt}%"}

    company_placeholders = ", ".join([f"%(company_{i})s" for i in range(len(companies))])
    for i, c in enumerate(companies):
        values[f"company_{i}"] = c

    # Category filter via Company Link table
    category_join = ""
    if category:
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON cl.employee = a.employee
                AND cl.category = %(category)s
        """
        values["category"] = category

    query = f"""
        SELECT DISTINCT
            a.employee,
            a.employee_name
        FROM `tabAttendance` a
        {category_join}
        WHERE
            a.company IN ({company_placeholders})
            AND a.attendance_date BETWEEN %(from_date)s AND %(to_date)s
            AND (a.employee LIKE %(txt)s OR a.employee_name LIKE %(txt)s)
        ORDER BY a.employee_name
        LIMIT 50
    """

    return frappe.db.sql(query, values, as_dict=True)


# ---------------------------------------------------------
# DATA
# ---------------------------------------------------------

def get_data(filters):
    if not filters.get("year") or not filters.get("month"):
        return []

    month_number  = list(calendar.month_name).index(filters.get("month"))
    year          = int(filters.get("year"))
    from_date     = datetime(year, month_number, 1).date()
    last_day      = calendar.monthrange(year, month_number)[1]
    to_date       = datetime(year, month_number, last_day).date()
    days_in_month = last_day

    companies = filters.get("company") or []
    if isinstance(companies, str):
        companies = json.loads(companies)
    if not companies:
        return []

    company_placeholders = ", ".join([f"%(company_{i})s" for i in range(len(companies))])
    values = {"from_date": from_date, "to_date": to_date}
    for i, c in enumerate(companies):
        values[f"company_{i}"] = c

    # Category join via Company Link
    category_join = ""
    if filters.get("category"):
        category_join = """
            INNER JOIN `tabCompany Link` cl
                ON cl.employee = a.employee
                AND cl.category = %(category)s
        """
        values["category"] = filters.get("category")

    # Optional employee filter
    selected_employees = filters.get("employee") or []
    if isinstance(selected_employees, str):
        selected_employees = json.loads(selected_employees)

    employee_filter = ""
    if selected_employees:
        emp_placeholders = ", ".join([f"%(emp_{i})s" for i in range(len(selected_employees))])
        employee_filter  = f"AND a.employee IN ({emp_placeholders})"
        for i, e in enumerate(selected_employees):
            values[f"emp_{i}"] = e

    # employee_name is stored on tabAttendance via fetch_from — no JOIN to tabEmployee needed
    query = f"""
        SELECT
            a.employee,
            a.employee_name,
            a.attendance_date,
            a.status
        FROM `tabAttendance` a
        {category_join}
        WHERE
            a.company IN ({company_placeholders})
            AND a.attendance_date BETWEEN %(from_date)s AND %(to_date)s
            {employee_filter}
        ORDER BY a.employee_name, a.attendance_date
    """

    records = frappe.db.sql(query, values, as_dict=True)

    if not records:
        return []

    employees = {}
    emp_order = []

    for row in records:
        emp    = row.employee
        day    = row.attendance_date.day
        status = row.status

        if emp not in employees:
            emp_order.append(emp)
            employees[emp] = {
                "employee":        emp,
                "employee_name":   row.employee_name or "",
                "working_days":    days_in_month,
                "present_days":    0,
                "half_days":       0,
                "absent_days":     0,
                "weekly_off_days": 0,
                "holiday_days":    0,
                "lwp_days":        0,
                "absent_lwp":      0,
            }

        # Map status → short code + counters
        if status == "Present":
            employees[emp]["present_days"]   += 1
            employees[emp][f"day_{day}"]      = "P"

        elif status == "Half Day":
            employees[emp]["half_days"]       += 1
            employees[emp]["present_days"]    += 0.5
            employees[emp]["absent_days"]     += 0.5
            employees[emp][f"day_{day}"]       = "HD"

        elif status == "Absent":
            employees[emp]["absent_days"]     += 1
            employees[emp]["absent_lwp"]      += 1
            employees[emp][f"day_{day}"]       = "A"

        elif status == "Weekly Off":
            employees[emp]["weekly_off_days"] += 1
            employees[emp][f"day_{day}"]       = "WO"

        elif status == "LWP":
            employees[emp]["lwp_days"]        += 1
            employees[emp]["absent_lwp"]      += 1
            employees[emp][f"day_{day}"]       = "LWP"

        elif status == "Holiday":
            employees[emp]["holiday_days"]    += 1
            employees[emp][f"day_{day}"]       = "H"

        else:
            employees[emp][f"day_{day}"]       = "-"

    float_fields = ["present_days", "half_days", "absent_days", "absent_lwp"]
    result = []
    for e in emp_order:
        row = employees[e]
        for f in float_fields:
            # Always show exactly 2 decimal places
            row[f] = round(row[f], 2)
        result.append(row)
    return result