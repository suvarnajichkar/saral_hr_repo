// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employee", {
	refresh(frm) {
        set_employee_name(frm);
	},
});


frappe.ui.form.on("Employee", {
    first_name: set_employee,
    middle_name: set_employee,
    last_name: set_employee
});

function set_employee(frm) {
    let first = frm.doc.first_name || "";
    let middle = frm.doc.middle_name || "";
    let last = frm.doc.last_name || "";

    let name_parts = [first, middle, last].filter(Boolean);
    let full_name = name_parts.join(" ");

    frm.set_value("employee", full_name);
}

