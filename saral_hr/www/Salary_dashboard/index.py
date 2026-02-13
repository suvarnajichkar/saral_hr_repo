import frappe
from datetime import datetime, date

def get_context(context):
    context.no_cache = 1
    context.companies = frappe.get_all("Company", fields=["name"], order_by="name asc")
    context.current_year = datetime.now().year
    context.years = list(range(context.current_year, context.current_year - 6, -1))

@frappe.whitelist(allow_guest=False)
def get_salary_dashboard_data(company, year):
    if not company or not year:
        return {}

    year = int(year)

    # Total employees - same as report (tabCompany Link)
    total_employees = frappe.db.sql("""
        SELECT COUNT(name)
        FROM `tabCompany Link`
        WHERE company = %s
        AND is_active = 1
    """, company)[0][0]

    if not total_employees:
        total_employees = frappe.db.sql("""
            SELECT COUNT(name)
            FROM `tabEmployee`
            WHERE company = %s
            AND status = 'Active'
        """, company)[0][0]

    if not total_employees:
        total_employees = frappe.db.sql("""
            SELECT COUNT(name)
            FROM `tabEmployee`
            WHERE company = %s
        """, company)[0][0]

    # Generated month wise (docstatus = 1)
    generated_data = frappe.db.sql("""
        SELECT
            MONTH(start_date) as month_number,
            COUNT(name) as count
        FROM `tabSalary Slip`
        WHERE company = %s
        AND YEAR(start_date) = %s
        AND docstatus = 1
        GROUP BY month_number
    """, (company, year), as_dict=1)

    generated_map = {row.month_number: row.count for row in generated_data}

    months = ["Jan","Feb","Mar","Apr","May","Jun",
              "Jul","Aug","Sep","Oct","Nov","Dec"]

    generated_list = []
    pending_list   = []
    today          = date.today()

    for i in range(1, 13):
        gen = generated_map.get(i, 0)

        # Future month — dono 0
        if year > today.year or (year == today.year and i > today.month):
            generated_list.append(0)
            pending_list.append(0)
            continue

        # Past/current month — pending = total - generated
        pending = max(0, total_employees - gen)
        generated_list.append(gen)
        pending_list.append(pending)

    # ── Cards ──
    # Total Generated = sum of all generated slips in year
    total_generated = sum(generated_list)

    # Total Pending = employees jinka is saal koi bhi submitted slip nahi
    # unique employees jinki slip submitted hai
    submitted_employees = frappe.db.sql("""
        SELECT COUNT(DISTINCT employee)
        FROM `tabSalary Slip`
        WHERE company = %s
        AND YEAR(start_date) = %s
        AND docstatus = 1
    """, (company, year))[0][0]

    total_pending = max(0, total_employees - submitted_employees)

    return {
        "labels"           : months,
        "generated"        : generated_list,
        "pending"          : pending_list,
        "total_employees"  : total_employees,
        "total_generated"  : total_generated,
        "total_pending"    : total_pending
    }