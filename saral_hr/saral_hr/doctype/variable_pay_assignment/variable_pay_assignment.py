# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe


class VariablePayAssignment(Document):

    def validate(self):
        self.validate_unique_month_year()
        self.validate_total_percentage()
        self.validate_duplicate_divisions()

    def validate_unique_month_year(self):
        """One record per Year + Month"""
        existing = frappe.db.exists(
            "Variable Pay Assignment",
            {
                "year": self.year,
                "month": self.month,
                "name": ["!=", self.name]
            }
        )
        if existing:
            frappe.throw(
                f"Variable Pay Assignment already exists for {self.month} {self.year}"
            )

    def validate_total_percentage(self):
        """Total percentage must not exceed 100"""
        total = sum((row.percentage or 0) for row in self.variable_pay)

        if total > 100:
            frappe.throw(
                f"Total Variable Pay Percentage cannot exceed 100%. Current total: {total}%"
            )

    def validate_duplicate_divisions(self):
        """No duplicate Division in child table"""
        divisions = [row.division for row in self.variable_pay if row.division]

        if len(divisions) != len(set(divisions)):
            frappe.throw("Duplicate Division found in Variable Pay table")
