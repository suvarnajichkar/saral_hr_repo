# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import (
	add_days,
	cint,
	getdate,
	nowdate,
	format_date,
)


class DuplicateAttendanceError(frappe.ValidationError):
	pass


class Attendance(Document):

	def validate(self):
		self.validate_attendance_date()
		self.validate_duplicate_record()
		self.validate_employee_active()

	# ------------------------------------------------------------------
	# Attendance Date Validation
	# ------------------------------------------------------------------
	def validate_attendance_date(self):
		"""
		Validate that attendance date is:
		- Not in the future (except On Leave)
		- Not before employee joining date
		"""

		if not self.employee or not self.attendance_date:
			return

		date_of_joining = frappe.db.get_value(
			"Company Link",
			self.employee,
			"date_of_joining"
		)

		# Future date check
		if (
			self.status != "On Leave"
			and getdate(self.attendance_date) > getdate(nowdate())
		):
			frappe.throw(
				_("Attendance cannot be marked for future dates: {0}").format(
					frappe.bold(format_date(self.attendance_date))
				)
			)

		# Before joining date check
		if date_of_joining and getdate(self.attendance_date) < getdate(date_of_joining):
			frappe.throw(
				_(
					"Attendance date {0} cannot be before employee's joining date {1}"
				).format(
					frappe.bold(format_date(self.attendance_date)),
					frappe.bold(format_date(date_of_joining)),
				)
			)

	# ------------------------------------------------------------------
	# Duplicate Attendance Validation
	# ------------------------------------------------------------------
	def validate_duplicate_record(self):
		"""
		Ensure only one attendance record per employee per date
		"""

		if not self.employee or not self.attendance_date:
			return

		duplicate = frappe.db.exists(
			"Attendance",
			{
				"employee": self.employee,
				"attendance_date": self.attendance_date,
				"docstatus": ["<", 2],
				"name": ["!=", self.name],
			},
		)

		if duplicate:
			frappe.throw(
				_(
					"Attendance for employee {0} is already marked for {1}"
				).format(
					frappe.bold(self.employee),
					frappe.bold(format_date(self.attendance_date)),
				),
				title=_("Duplicate Attendance"),
				exc=DuplicateAttendanceError,
			)

	# ------------------------------------------------------------------
	# Active Employee Validation (Company Link)
	# ------------------------------------------------------------------
	def validate_employee_active(self):
		"""
		Ensure attendance is marked only for active Company Link records
		"""

		if not self.employee:
			return

		is_active = frappe.db.get_value(
			"Company Link",
			self.employee,
			"is_active"
		)

		if not is_active:
			frappe.throw(
				_("Cannot mark attendance for an inactive employee: {0}").format(
					frappe.bold(self.employee)
				)
			)


# ======================================================================
# BULK ATTENDANCE
# ======================================================================
@frappe.whitelist()
def mark_bulk_attendance(employee, dates, status):
	"""
	Mark attendance for multiple dates for one employee
	"""

	import json

	if isinstance(dates, str):
		dates = json.loads(dates)

	if not dates:
		frappe.throw(_("Please select at least one date"))

	created = 0
	skipped = 0
	errors = []

	for date in dates:
		try:
			exists = frappe.db.exists(
				"Attendance",
				{
					"employee": employee,
					"attendance_date": date,
					"docstatus": ["<", 2],
				},
			)

			if exists:
				skipped += 1
				continue

			attendance = frappe.new_doc("Attendance")
			attendance.employee = employee
			attendance.attendance_date = date
			attendance.status = status
			attendance.insert()
			attendance.submit()

			created += 1

		except Exception as e:
			error_msg = f"{date}: {str(e)}"
			errors.append(error_msg)
			frappe.log_error(error_msg, "Bulk Attendance Error")

	frappe.db.commit()

	return {
		"created": created,
		"skipped": skipped,
		"total": len(dates),
		"errors": errors or None,
	}


# ======================================================================
# UNMARKED DAYS
# ======================================================================
@frappe.whitelist()
def get_unmarked_days(employee, from_date, to_date, exclude_holidays=0):
	"""
	Return list of days without attendance
	"""

	from_date = getdate(from_date)
	to_date = getdate(to_date)

	records = frappe.get_all(
		"Attendance",
		fields=["attendance_date"],
		filters={
			"employee": employee,
			"attendance_date": ["between", [from_date, to_date]],
			"docstatus": ["!=", 2],
		},
	)

	marked_days = {getdate(d.attendance_date) for d in records}
	unmarked_days = []

	current = from_date
	while current <= to_date:
		if current not in marked_days:
			if cint(exclude_holidays):
				if current.weekday() not in [5, 6]:
					unmarked_days.append(current)
			else:
				unmarked_days.append(current)
		current = add_days(current, 1)

	return unmarked_days


# ======================================================================
# CALENDAR EVENTS
# ======================================================================
@frappe.whitelist()
def get_events(start, end, filters=None):
	"""
	Calendar events for Attendance
	"""

	from frappe.desk.reportview import get_filters_cond

	conditions = get_filters_cond("Attendance", filters, [])

	query = f"""
		SELECT
			name,
			attendance_date,
			status,
			employee_name
		FROM `tabAttendance`
		WHERE attendance_date BETWEEN %(start)s AND %(end)s
		AND docstatus < 2
		{conditions or ""}
	"""

	events = []

	for d in frappe.db.sql(query, {"start": start, "end": end}, as_dict=True):
		events.append({
			"name": d.name,
			"doctype": "Attendance",
			"start": d.attendance_date,
			"end": d.attendance_date,
			"title": f"{d.employee_name or d.name}: {d.status}",
			"allDay": 1,
		})

	return events
