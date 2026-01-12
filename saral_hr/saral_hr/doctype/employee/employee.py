# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import set_name_by_naming_series

class Employee(Document):
    def autoname(self):
        set_name_by_naming_series(self)
