frappe.ui.form.on("Shift Type", {
	refresh(frm) {
		if (!frm.is_new()) return;

		// Defaults for General shift
		frm.set_value("late_entry_grace", 15);
		frm.set_value("early_exit_grace", 15);
		frm.set_value("half_day_hours", 4);
	},

	start_time(frm) {
		validate_time(frm);
	},

	end_time(frm) {
		validate_time(frm);
	}
});

function validate_time(frm) {
	if (frm.doc.start_time && frm.doc.end_time) {
		if (frm.doc.start_time >= frm.doc.end_time) {
			frappe.msgprint("End Time must be after Start Time");
			frm.set_value("end_time", null);
		}
	}
}