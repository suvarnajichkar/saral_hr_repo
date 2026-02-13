import frappe
from frappe import _
from calendar import monthrange
from datetime import datetime


def get_data(filters=None):
	"""
	Returns data for Salary Slip Status by Company chart.
	Shows three datasets: Submitted, Draft, Not Created — grouped by company.
	"""
	if filters is None:
		filters = {}

	month = filters.get("month")
	year = filters.get("year")
	company = filters.get("company")

	# ── Date range ──────────────────────────────────────────────────────────────
	month_map = {
		"January": 1, "February": 2, "March": 3, "April": 4,
		"May": 5, "June": 6, "July": 7, "August": 8,
		"September": 9, "October": 10, "November": 11, "December": 12,
	}

	if month and year:
		month_num = month_map.get(month, 12)
		year_int = int(year)
	else:
		# Default: current month / year
		now = datetime.now()
		month_num = now.month
		year_int = now.year

	start_date = "{0}-{1:02d}-01".format(year_int, month_num)
	last_day = monthrange(year_int, month_num)[1]
	end_date = "{0}-{1:02d}-{2:02d}".format(year_int, month_num, last_day)

	# ── Build optional company filter clauses ────────────────────────────────────
	company_filter_emp = ""
	company_filter_slip = ""
	params = {"start_date": start_date, "end_date": end_date}

	if company:
		company_filter_emp = " AND emp.company = %(company)s"
		company_filter_slip = " AND ss.company = %(company)s"
		params["company"] = company

	# ── Total active employees per company ──────────────────────────────────────
	total_rows = frappe.db.sql("""
		SELECT emp.company, COUNT(DISTINCT emp.name) AS total
		FROM `tabEmployee` emp
		WHERE emp.status = 'Active'
		  {0}
		GROUP BY emp.company
	""".format(company_filter_emp), params, as_dict=1)

	# ── Submitted salary slips (docstatus = 1) ──────────────────────────────────
	submitted_rows = frappe.db.sql("""
		SELECT ss.company, COUNT(DISTINCT ss.employee) AS cnt
		FROM `tabSalary Slip` ss
		WHERE ss.start_date >= %(start_date)s
		  AND ss.end_date   <= %(end_date)s
		  AND ss.docstatus   = 1
		  {0}
		GROUP BY ss.company
	""".format(company_filter_slip), params, as_dict=1)

	# ── Draft salary slips (docstatus = 0) ──────────────────────────────────────
	draft_rows = frappe.db.sql("""
		SELECT ss.company, COUNT(DISTINCT ss.employee) AS cnt
		FROM `tabSalary Slip` ss
		WHERE ss.start_date >= %(start_date)s
		  AND ss.end_date   <= %(end_date)s
		  AND ss.docstatus   = 0
		  {0}
		GROUP BY ss.company
	""".format(company_filter_slip), params, as_dict=1)

	# ── Aggregate into a dict keyed by company ───────────────────────────────────
	companies = {}

	for row in total_rows:
		companies[row.company] = {"total": row.total, "submitted": 0, "draft": 0}

	for row in submitted_rows:
		if row.company not in companies:
			companies[row.company] = {"total": 0, "submitted": 0, "draft": 0}
		companies[row.company]["submitted"] = row.cnt

	for row in draft_rows:
		if row.company not in companies:
			companies[row.company] = {"total": 0, "submitted": 0, "draft": 0}
		companies[row.company]["draft"] = row.cnt

	# ── Derive "Not Created" count ───────────────────────────────────────────────
	labels = []
	submitted_data = []
	draft_data = []
	not_created_data = []

	for company_name in sorted(companies.keys()):
		d = companies[company_name]
		not_created = max(0, d["total"] - d["submitted"] - d["draft"])

		labels.append(company_name)
		submitted_data.append(d["submitted"])
		draft_data.append(d["draft"])
		not_created_data.append(not_created)

	return {
		"labels": labels,
		"datasets": [
			{"name": _("Submitted"),    "values": submitted_data,    "chartType": "bar"},
			{"name": _("Draft"),        "values": draft_data,        "chartType": "bar"},
			{"name": _("Not Created"),  "values": not_created_data,  "chartType": "bar"},
		],
	}


def get_filters():
	"""Filter configuration for the dashboard chart."""
	current_year = datetime.now().year
	year_options = "\n".join([""] + [str(y) for y in range(current_year + 1, current_year - 5, -1)])

	return [
		{
			"fieldname": "month",
			"label": _("Month"),
			"fieldtype": "Select",
			"options": (
				"\nJanuary\nFebruary\nMarch\nApril\nMay\nJune"
				"\nJuly\nAugust\nSeptember\nOctober\nNovember\nDecember"
			),
			"default": datetime.now().strftime("%B"),
		},
		{
			"fieldname": "year",
			"label": _("Year"),
			"fieldtype": "Select",
			"options": year_options,
			"default": str(current_year),
		},
		{
			"fieldname": "company",
			"label": _("Company"),
			"fieldtype": "Link",
			"options": "Company",
		},
	]