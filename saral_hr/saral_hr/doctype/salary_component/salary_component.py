import frappe
from frappe.model.document import Document

class SalaryComponent(Document):
	def validate(self):
		if self.is_special_component:
			self.populate_months()

	def populate_months(self):
		months = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		]

		unique = {}
		for row in self.enter_amount_according_to_months:
			if row.month in months and row.month not in unique:
				unique[row.month] = row

		self.enter_amount_according_to_months = []

		for month in months:
			self.append("enter_amount_according_to_months", {
				"month": month,
				"amount": unique.get(month, {}).amount if month in unique else 0.0
			})
