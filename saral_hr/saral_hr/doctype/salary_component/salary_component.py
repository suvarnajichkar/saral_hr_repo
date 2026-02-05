# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class SalaryComponent(Document):
	def validate(self):
		if self.is_special_component:
			self.populate_months()
	
	def populate_months(self):
		"""Populate all 12 months if table is empty"""
		months = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		]
		
		# Get existing months in the table
		existing_months = [row.month for row in self.enter_amount_according_to_months]
		
		# Add missing months
		for month in months:
			if month not in existing_months:
				self.append("enter_amount_according_to_months", {
					"month": month,
					"amount": 0.0
				})
		
		# Sort by month order
		month_order = {month: idx for idx, month in enumerate(months)}
		self.enter_amount_according_to_months = sorted(
			self.enter_amount_according_to_months,
			key=lambda x: month_order.get(x.month, 999)
		)