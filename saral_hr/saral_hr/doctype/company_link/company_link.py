# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class CompanyLink(Document):

    def validate(self):
        self.validate_active_employee()
        self.validate_left_date()

    def validate_active_employee(self):
        """
        An employee can be active in ONLY ONE company at a time
        """

        # Required fields
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
                ),
                title=_("Employee Already Active")
            )

    def validate_left_date(self):
        """
        Automatically deactivate when left date is set
        """
        if self.left_date and self.is_active:
            frappe.msgprint(
                _("Employee has a left date. The record will be marked as inactive."),
                indicator="orange"
            )
            self.is_active = 0