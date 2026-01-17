// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Salary Structure", {
    refresh(frm) {
        // Calculate totals on form load
        calculate_totals(frm);
    }
});

frappe.ui.form.on("Salary Details", {
    earnings_add: function(frm, cdt, cdn) {
        // Set filter for earnings table
        set_salary_component_filter(frm, cdt, cdn, "Earning");
    },
    
    deductions_add: function(frm, cdt, cdn) {
        // Set filter for deductions table
        set_salary_component_filter(frm, cdt, cdn, "Deduction");
    },
    
    amount: function(frm, cdt, cdn) {
        // Recalculate totals when amount changes
        calculate_totals(frm);
    },
    
    earnings_remove: function(frm) {
        // Recalculate totals when row is removed
        calculate_totals(frm);
    },
    
    deductions_remove: function(frm) {
        // Recalculate totals when row is removed
        calculate_totals(frm);
    },
    
    salary_component: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        
        // Fetch the salary component details
        if (row.salary_component) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Salary Component',
                    name: row.salary_component
                },
                callback: function(r) {
                    if (r.message) {
                        // Set the abbreviation
                        frappe.model.set_value(cdt, cdn, 'abbr', r.message.salary_component_abbr);
                    }
                }
            });
        }
    }
});

function set_salary_component_filter(frm, cdt, cdn, component_type) {
    let row = locals[cdt][cdn];
    
    // Get already selected components from the respective table
    let selected_components = [];
    let table_name = component_type === "Earning" ? "earnings" : "deductions";
    
    if (frm.doc[table_name]) {
        frm.doc[table_name].forEach(function(d) {
            if (d.salary_component && d.name !== row.name) {
                selected_components.push(d.salary_component);
            }
        });
    }
    
    // Set query for salary_component field
    frm.fields_dict[table_name].grid.get_field('salary_component').get_query = function(doc, cdt, cdn) {
        return {
            filters: {
                'type': component_type,
                'name': ['not in', selected_components]
            }
        };
    };
}

function calculate_totals(frm) {
    let total_earnings = 0;
    let total_deductions = 0;
    
    // Calculate total earnings
    if (frm.doc.earnings) {
        frm.doc.earnings.forEach(function(d) {
            total_earnings += flt(d.amount);
        });
    }
    
    // Calculate total deductions
    if (frm.doc.deductions) {
        frm.doc.deductions.forEach(function(d) {
            total_deductions += flt(d.amount);
        });
    }
    
    // Set the totals
    frm.set_value('total_earnings', total_earnings);
    frm.set_value('total_deduction', total_deductions);
    frm.set_value('net_pay', total_earnings - total_deductions);
}