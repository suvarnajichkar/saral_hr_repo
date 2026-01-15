# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import set_name_by_naming_series

class Employee(Document):
    def autoname(self):
        set_name_by_naming_series(self)

    def validate(self):
        # Populate Full Name into the actual field "employee"
        name_parts = [self.first_name, self.middle_name, self.last_name]
        self.employee = " ".join(filter(None, name_parts))
<<<<<<< HEAD
        
        # Update current company
        self.update_current_company()
    
    def update_current_company(self):
        """Fetch the current active company for this employee"""
        active_company = frappe.db.get_value(
            "Company Link",
            filters={
                "employee": self.name,
                "is_active": 1
            },
            fieldname="company"
        )
        self.current_company = active_company or None
=======
>>>>>>> origin/main
