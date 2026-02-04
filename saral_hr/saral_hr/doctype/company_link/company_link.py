import frappe
from frappe.model.document import Document
from frappe import _


class CompanyLink(Document):

    def validate(self):
        self.sync_holiday_list_from_company()
        self.validate_active_employee()
        self.validate_left_date()

    def sync_holiday_list_from_company(self):
        if not self.company:
            return

        holiday_list = frappe.db.get_value(
            "Company",
            self.company,
            "default_holiday_list"
        )

        if holiday_list:
            self.holiday_list = holiday_list

    def validate_active_employee(self):
        if not self.employee or not self.is_active:
            return

        existing_active = frappe.db.sql("""
            SELECT name, company
            FROM `tabCompany Link`
            WHERE employee = %(employee)s
              AND is_active = 1
              AND name != %(name)s
            LIMIT 1
        """, {
            "employee": self.employee,
            "name": self.name or ""
        })

        if existing_active:
            frappe.throw(
                _(
                    "Employee {0} is already active in company {1} (Record: {2}). "
                    "Please deactivate the existing record before assigning to another company."
                ).format(
                    frappe.bold(self.employee),
                    frappe.bold(existing_active[0][1]),
                    frappe.bold(existing_active[0][0])
                )
            )

    def validate_left_date(self):
        if self.left_date and self.is_active:
            self.is_active = 0


