import frappe
from frappe.model.document import Document
from frappe import _

class ShiftType(Document):

	def validate(self):
		self.validate_timings()
		self.validate_grace_values()

	def validate_timings(self):
		if self.start_time >= self.end_time:
			frappe.throw(
				_("End Time must be after Start Time")
			)

	def validate_grace_values(self):
		if self.late_entry_grace < 0 or self.early_exit_grace < 0:
			frappe.throw(_("Grace period cannot be negative"))

		if self.half_day_hours <= 0:
			frappe.throw(_("Half Day Threshold must be greater than zero"))