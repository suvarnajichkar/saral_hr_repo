# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class Company(Document):
    def validate(self):
        """Validate company details before saving"""
        pass

    def on_update(self):
        """Called after company is updated"""
        pass
