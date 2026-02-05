# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SalaryStructureAssignment(Document):
    def validate(self):
        """
        Allow users to manually enter amounts for all components.
        Do not auto-clear Variable Pay or any other component amounts.
        """
        # Just let the user enter whatever they want
        # The client-side JS will handle calculations
        pass