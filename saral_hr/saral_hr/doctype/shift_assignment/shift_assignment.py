# Copyright (c) 2026
# License: MIT

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import getdate, nowdate
from datetime import date


class ShiftAssignment(Document):

	def validate(self):
		self.validate_dates()
		self.validate_employee_active()
		self.validate_overlapping_assignments()
		self.auto_complete_if_expired()

	# --------------------------------------------------
	# DATE VALIDATION
	# --------------------------------------------------
	def validate_dates(self):
		if self.from_date and self.to_date:
			if getdate(self.to_date) < getdate(self.from_date):
				frappe.throw(_("To Date cannot be before From Date"))

	# --------------------------------------------------
	# EMPLOYEE STATUS
	# --------------------------------------------------
	def validate_employee_active(self):
		if self.status != "Active":
			return

		emp = frappe.get_doc("Company Link", self.employee)
		if not emp.is_active:
			frappe.throw(_("Cannot assign shift to inactive employee"))

	# --------------------------------------------------
	# OVERLAP CHECK (CORE BUSINESS RULE)
	# --------------------------------------------------
	def validate_overlapping_assignments(self):
		if self.status != "Active":
			return

		existing = frappe.get_all(
			"Shift Assignment",
			filters={
				"employee": self.employee,
				"status": "Active",
				"name": ("!=", self.name)
			},
			fields=["from_date", "to_date"]
		)

		for row in existing:
			if self.is_overlap(
				getdate(self.from_date),
				getdate(self.to_date) if self.to_date else None,
				getdate(row.from_date),
				getdate(row.to_date) if row.to_date else None
			):
				frappe.throw(_("Employee already has an active shift in this period"))

	# --------------------------------------------------
	# OVERLAP LOGIC
	# --------------------------------------------------
	def is_overlap(self, s1, e1, s2, e2):
		e1 = e1 or date(2099, 12, 31)
		e2 = e2 or date(2099, 12, 31)
		return s1 <= e2 and s2 <= e1

	# --------------------------------------------------
	# AUTO COMPLETE OLD ASSIGNMENTS
	# --------------------------------------------------
	def auto_complete_if_expired(self):
		if self.status == "Active" and self.to_date:
			if getdate(self.to_date) < getdate(nowdate()):
				self.status = "Completed"


@frappe.whitelist()
def get_active_shift(employee, on_date=None):
	on_date = getdate(on_date or nowdate())

	assignment = frappe.db.get_value(
		"Shift Assignment",
		{
			"employee": employee,
			"status": "Active",
			"from_date": ("<=", on_date),
			"to_date": ("in", [None, "", (">=", on_date)])
		},
		"shift"
	)

	return assignment
