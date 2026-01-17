# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SalaryStructureAssignment(Document):

    def validate(self):
        self.validate_employee_active()

    def validate_employee_active(self):
        if not self.employee:
            return

        is_active = frappe.db.get_value(
            "Company Link",
            self.employee,
            "is_active"
        )

        if not is_active:
            frappe.throw(
                _("Cannot assign salary structure to an inactive employee: {0}")
                .format(frappe.bold(self.employee))
            )
