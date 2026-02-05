frappe.ui.form.on('Salary Component', {
	is_special_component: function(frm) {
		if (frm.doc.is_special_component) {
			populate_all_months(frm);
		} else {
			// Clear the table if unchecked
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
	
	// Get existing months
	let existing_months = frm.doc.enter_amount_according_to_months.map(row => row.month);
	
	// Add missing months
	months.forEach(month => {
		if (!existing_months.includes(month)) {
			let row = frm.add_child('enter_amount_according_to_months');
			row.month = month;
			row.amount = 0.0;
		}
	});
	
	// Refresh the field to show the table
	frm.refresh_field('enter_amount_according_to_months');
}