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

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function populate_all_months(frm) {
    // Build a map of existing amounts so we don't lose entered data
    let existing = {};
    (frm.doc.enter_amount_according_to_months || []).forEach(r => {
        if (r.month) existing[r.month] = r.amount;
    });

    // Clear and rebuild with exactly 12 rows, sorted Jan–Dec
    frm.clear_table('enter_amount_according_to_months');

    MONTHS.forEach(month => {
        let row = frm.add_child('enter_amount_according_to_months');
        row.month = month;
        row.amount = existing[month] || 0;
    });

    frm.refresh_field('enter_amount_according_to_months');
}

function lock_month_table(frm) {
    // Wait for DOM to be ready before hiding buttons
    frappe.after_ajax(() => {
        const field = frm.get_field('enter_amount_according_to_months');
        if (!field || !field.grid) return;

        const grid = field.grid;

        // Prevent adding or deleting rows
        grid.cannot_add_rows = true;
        grid.cannot_delete_rows = true;

        // Hide add/remove/checkbox UI elements
        grid.wrapper.find('.grid-add-row').hide();
        grid.wrapper.find('.grid-remove-rows').hide();
        grid.wrapper.find('.grid-row-check').hide();
        grid.wrapper.find('.grid-delete-row').hide();
    });
}