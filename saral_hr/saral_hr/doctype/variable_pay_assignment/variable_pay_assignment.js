// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Variable Pay Assignment", {
    refresh(frm) {
        set_division_filter(frm);
    }
});

frappe.ui.form.on("Variable Pay Detail Table", {
    division(frm, cdt, cdn) {
        set_division_filter(frm);
    },

    percentage(frm, cdt, cdn) {
        validate_total_percentage(frm);
    },

    variable_pay_remove(frm) {
        validate_total_percentage(frm);
        set_division_filter(frm);
    }
});

function set_division_filter(frm) {
    let selected_divisions = [];

    (frm.doc.variable_pay || []).forEach(row => {
        if (row.division) {
            selected_divisions.push(row.division);
        }
    });

    frm.fields_dict.variable_pay.grid.get_field("division").get_query = function () {
        return {
            filters: [
                ["Division", "name", "not in", selected_divisions]
            ]
        };
    };
}

function validate_total_percentage(frm) {
    let total = 0;

    (frm.doc.variable_pay || []).forEach(row => {
        total += flt(row.percentage);
    });

    if (total > 100) {
        frappe.msgprint({
            title: "Percentage Limit Exceeded",
            message: `Total Variable Pay Percentage cannot exceed 100%. Current total: ${total}%`,
            indicator: "red"
        });
    }
}
