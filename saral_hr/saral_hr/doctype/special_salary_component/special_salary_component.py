import frappe
from frappe.model.document import Document


class SpecialSalaryComponent(Document):
    def autoname(self):
        # Deterministic name: parentname-month e.g. "Basic Salary-January"
        # Since parent deletes all rows via raw SQL before inserting,
        # this name will never already exist in DB when insert runs
        self.name = f"{self.parent}-{self.month}"