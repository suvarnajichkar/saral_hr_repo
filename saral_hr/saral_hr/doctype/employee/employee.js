frappe.ui.form.on("Employee", {
    refresh(frm) {
        set_employee_name(frm);
    },
    first_name(frm) { set_employee_name(frm); },
    middle_name(frm) { set_employee_name(frm); },
    last_name(frm) { set_employee_name(frm); }
});

function set_employee_name(frm) {
    let first = frm.doc.first_name || "";
    let middle = frm.doc.middle_name || "";
    let last = frm.doc.last_name || "";

    let full_name = [first, middle, last].filter(Boolean).join(" ");
    
    // Use your actual fieldname: "employee"
    frm.set_value("employee", full_name);
}
