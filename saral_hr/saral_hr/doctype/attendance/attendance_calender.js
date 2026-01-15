// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.views.calendar["Attendance"] = {
	field_map: {
		start: "attendance_date",
		end: "attendance_date",
		id: "name",
		title: "title",
		allDay: "allDay",
	},
	get_css_class: function (data) {
		if (data.status === "Absent" || data.status === "On Leave") {
			return "danger";
		}
		if (data.status === "Half Day") {
			return "warning";
		}
		if (data.status === "Present" || data.status === "Work From Home") {
			return "success";
		}
		return "default";
	},
	options: {
		header: {
			left: "prev,next today",
			center: "title",
			right: "month",
		},
	},
	get_events_method: "saral_hr.saral_hr.doctype.attendance.attendance.get_events",
};