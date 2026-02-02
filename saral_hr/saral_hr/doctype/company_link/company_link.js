frappe.ui.form.on("Company Link", {

	setup(frm) {
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
		if (frm.doc.is_active) {
			frm.page.set_indicator(__("Active"), "green");
		} else {
			frm.page.set_indicator(__("Inactive"), "gray");
		}

		if (frm.doc.employee && !frm.is_new()) {
			frm.add_custom_button(__("View All Records"), function () {
				frappe.set_route("List", "Company Link", {
					employee: frm.doc.employee
				});
			});
		}
	},

	company(frm) {
		// Auto-fetch holiday list when company changes
		if (frm.doc.company) {
			frappe.db.get_value(
				"Company",
				frm.doc.company,
				"default_holiday_list",
				(r) => {
					if (r && r.default_holiday_list) {
						frm.set_value("holiday_list", r.default_holiday_list);
					}
				}
			);
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
