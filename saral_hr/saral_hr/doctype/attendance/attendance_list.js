frappe.listview_settings["Attendance"] = {
	add_fields: ["status", "attendance_date"],

	get_indicator(doc) {
		if (["Present", "Work From Home"].includes(doc.status)) {
			return [__(doc.status), "green", "status,=," + doc.status];
		} else if (["Absent", "On Leave"].includes(doc.status)) {
			return [__(doc.status), "red", "status,=," + doc.status];
		} else if (doc.status === "Half Day") {
			return [__(doc.status), "orange", "status,=," + doc.status];
		}
	},

	onload(list_view) {
		const me = this;

		list_view.page.add_inner_button(__("Mark Attendance"), function () {
			const dialog = new frappe.ui.Dialog({
				title: __("Mark Attendance"),
				fields: [
					{
						fieldname: "employee",
						label: __("For Employee"),
						fieldtype: "Link",
						options: "Company Link",
						reqd: 1,
						get_query() {
							return {
								filters: {
									is_active: 1
								}
							};
						},
						onchange: () => me.reset_dialog(dialog),
					},
					{ fieldtype: "Section Break", fieldname: "time_period_section", hidden: 1 },
					{
						fieldname: "from_date",
						label: __("Start"),
						fieldtype: "Date",
						reqd: 1,
						onchange: () => me.get_unmarked_days(dialog),
					},
					{ fieldtype: "Column Break" },
					{
						fieldname: "to_date",
						label: __("End"),
						fieldtype: "Date",
						reqd: 1,
						onchange: () => me.get_unmarked_days(dialog),
					},
					{ fieldtype: "Section Break", fieldname: "days_section", hidden: 1 },
					{
						fieldname: "status",
						label: __("Status"),
						fieldtype: "Select",
						options: ["Present", "Absent", "Half Day", "Work From Home"],
						reqd: 1,
					},
					{
						fieldname: "exclude_holidays",
						label: __("Exclude Holidays"),
						fieldtype: "Check",
						onchange: () => me.get_unmarked_days(dialog),
					},
					{
						fieldname: "unmarked_days",
						label: __("Unmarked Attendance for days"),
						fieldtype: "MultiCheck",
						columns: 2,
						select_all: true,
					},
				],
				primary_action(data) {
					frappe.call({
						method: "saral_hr.saral_hr.doctype.attendance.attendance.mark_bulk_attendance",
						args: {
							employee: data.employee,
							dates: data.unmarked_days,
							status: data.status,
						},
						callback() {
							frappe.show_alert({
								message: __("Attendance marked successfully"),
								indicator: "green",
							});
							dialog.hide();
							list_view.refresh();
						},
					});
				},
				primary_action_label: __("Mark Attendance"),
			});

			dialog.show();
		});
	},

	reset_dialog(dialog) {
		dialog.set_df_property("time_period_section", "hidden", 0);
		dialog.set_df_property("days_section", "hidden", 1);
		dialog.set_df_property("unmarked_days", "options", []);
	},

	get_unmarked_days(dialog) {
		const f = dialog.fields_dict;
		if (f.employee.value && f.from_date.value && f.to_date.value) {
			dialog.set_df_property("days_section", "hidden", 0);

			frappe.call({
				method: "saral_hr.saral_hr.doctype.attendance.attendance.get_unmarked_days",
				args: {
					employee: f.employee.value,
					from_date: f.from_date.value,
					to_date: f.to_date.value,
					exclude_holidays: f.exclude_holidays.value,
				},
				callback(r) {
					const options = (r.message || []).map(d => ({
						label: moment(d).format("DD-MM-YYYY"),
						value: d,
						checked: 1,
					}));
					dialog.set_df_property("unmarked_days", "options", options);
				},
			});
		}
	},
};
