frappe.ui.form.on("Company Link", {

	setup(frm) {
		// Default naming series
		if (frm.is_new() && !frm.doc.naming_series) {
			frm.set_value("naming_series", "CL-.YYYY.-");
		}
	},

	onload(frm) {
		if (frm.is_new() && !frm.doc.naming_series) {
			frm.set_value("naming_series", "CL-.YYYY.-");
		}
	},

	refresh(frm) {
		// Status indicator
		if (frm.doc.is_active) {
			frm.page.set_indicator(__("Active"), "green");
		} else {
			frm.page.set_indicator(__("Inactive"), "gray");
		}

		// View all records for this employee
		if (frm.doc.employee && !frm.is_new()) {
			frm.add_custom_button(__("View All Records"), function () {
				frappe.set_route("List", "Company Link", {
					employee: frm.doc.employee
				});
			});
		}
	},

	employee(frm) {
		if (frm.doc.employee && frm.doc.is_active && !frm.is_new()) {
			check_existing_active_employee(frm);
		}
	},

	is_active(frm) {
		if (frm.doc.is_active && frm.doc.employee && !frm.is_new()) {
			check_existing_active_employee(frm);
		}
	},

	left_date(frm) {
		if (frm.doc.left_date && frm.doc.is_active) {
			frappe.msgprint(__("Employee has left. The record will be marked as inactive."));
			frm.set_value("is_active", 0);
		}
	}
});


function check_existing_active_employee(frm) {
	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Company Link",
			filters: {
				employee: frm.doc.employee,
				is_active: 1,
				name: ["!=", frm.doc.name || ""]
			},
			fields: ["name", "company"]
		},
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				frappe.msgprint({
					title: __("Warning"),
					indicator: "orange",
					message: __(
						"Employee is already active in company {0} (Record: {1}). "
						+ "Please deactivate that record first.",
						[r.message[0].company, r.message[0].name]
					)
				});
			}
		}
	});
}


