frappe.listview_settings["Attendance"] = {

	onload(list_view) {
		list_view.page.add_inner_button(__('Mark Attendance'), function () {
			const url = "/mark_attendance";
			window.location.href = frappe.urllib.get_full_url(url);
		});
	},

	get_indicator: function (doc) {

		if (doc.status === "Present") {
			return [__("Present"), "green", "status,=,Present"];
		}

		if (doc.status === "Absent") {
			return [__("Absent"), "red", "status,=,Absent"];
		}

		if (doc.status === "On Leave") {
			return [__("On Leave"), "blue", "status,=,On Leave"];
		}

		if (doc.status === "Work From Home") {
			return [__("WFH"), "purple", "status,=,Work From Home"];
		}
	}
};
