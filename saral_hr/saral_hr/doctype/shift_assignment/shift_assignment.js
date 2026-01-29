frappe.ui.form.on('Shift Assignment', {
	from_date(frm) {
		validate_dates(frm);
	},

	to_date(frm) {
		validate_dates(frm);
	}
});

function validate_dates(frm) {
	if (frm.doc.from_date && frm.doc.to_date) {
		if (frm.doc.to_date < frm.doc.from_date) {
			frappe.msgprint({
				title: __('Invalid Dates'),
				indicator: 'red',
				message: __('To Date cannot be before From Date')
			});
			frm.set_value('to_date', '');
		}
	}
}
