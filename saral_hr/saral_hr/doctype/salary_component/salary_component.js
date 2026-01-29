frappe.listview_settings['Salary Component'] = {
	add_fields: ['type'],

	get_indicator: function (doc) {
		if (doc.type === 'Earning') {
			return ['Earning', 'green', 'type,=,Earning'];
		}
		if (doc.type === 'Deduction') {
			return ['Deduction', 'red', 'type,=,Deduction'];
		}
	}
};
