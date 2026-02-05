// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

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
		// Set status indicator
		if (frm.doc.is_active) {
			frm.page.set_indicator(__("Active"), "green");
		} else {
			frm.page.set_indicator(__("Inactive"), "gray");
		}

		// Add custom button to view all records
		if (frm.doc.employee && !frm.is_new()) {
			frm.add_custom_button(__("View All Records"), function () {
				frappe.set_route("List", "Company Link", {
					employee: frm.doc.employee
				});
			});
		}
		
		// Refresh company-related fields from master
		refresh_company_fields(frm);
	},

	company(frm) {
		// Auto-fetch fields when company changes
		refresh_company_fields(frm);
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

/**
 * Refresh company-related fields from Company master
 * Fetches latest values and AUTO-SAVES if fields have changed
 */
function refresh_company_fields(frm) {
	if (frm.doc.company && !frm.is_new()) {
		frappe.db.get_value(
			"Company",
			frm.doc.company,
			["salary_calculation_based_on", "default_holiday_list"],
			(r) => {
				if (r) {
					let fields_changed = false;
					
					// Check and update salary calculation field
					if (r.salary_calculation_based_on && 
						r.salary_calculation_based_on !== frm.doc.salary_calculation_based_on) {
						frm.set_value("salary_calculation_based_on", r.salary_calculation_based_on);
						fields_changed = true;
					}
					
					// Check and update holiday list field
					if (r.default_holiday_list && 
						r.default_holiday_list !== frm.doc.holiday_list) {
						frm.set_value("holiday_list", r.default_holiday_list);
						fields_changed = true;
					}
					
					// Auto-save if any field changed
					if (fields_changed && !frm.is_dirty()) {
						setTimeout(() => {
							frm.save().then(() => {
								frappe.show_alert({
									message: __('Company Link updated with latest Company settings'),
									indicator: 'green'
								}, 3);
							});
						}, 500);
					}
				}
			}
		);
	}
}

/**
 * Check if employee already has an active record in another company
 */
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
						"Employee is already active in company {0} (Record: {1}). " +
						"Please deactivate that record first.",
						[r.message[0].company, r.message[0].name]
					)
				});
			}
		}
	});
}