frappe.ui.form.on('Salary Component', {
	refresh(frm) {
		if (frm.doc.is_special_component) {
			lock_month_table(frm);
		}
	},

	is_special_component(frm) {
		if (frm.doc.is_special_component) {
			populate_all_months(frm);
			lock_month_table(frm);
		} else {
			frm.clear_table('enter_amount_according_to_months');
			frm.refresh_field('enter_amount_according_to_months');
		}
	}
});

function populate_all_months(frm) {
	const months = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];

	let existing_months = (frm.doc.enter_amount_according_to_months || [])
		.map(r => r.month);

	months.forEach(month => {
		if (!existing_months.includes(month)) {
			let row = frm.add_child('enter_amount_according_to_months');
			row.month = month;
			row.amount = 0;
		}
	});

	frm.refresh_field('enter_amount_according_to_months');
}

function lock_month_table(frm) {
	const grid = frm.get_field('enter_amount_according_to_months').grid;

	// 🔒 stop add row
	grid.cannot_add_rows = true;

	// 🔒 hide UI buttons
	grid.wrapper.find('.grid-add-row').hide();
	grid.wrapper.find('.grid-remove-rows').hide();
	grid.wrapper.find('.grid-row-check').hide();
}
