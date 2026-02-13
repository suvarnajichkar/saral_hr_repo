import frappe
from saral_hr.saral_hr.dashboard_chart_source.salary_slip_status.salary_slip_status import get_data, get_filters

@frappe.whitelist()
def get_salary_slip_chart_data(filters=None):
    """API endpoint for salary slip dashboard chart"""
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)
    return get_data(filters)

@frappe.whitelist()
def get_salary_slip_chart_filters():
    """API endpoint for salary slip dashboard filters"""
    return get_filters()
