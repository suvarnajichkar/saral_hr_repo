// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Salary Structure Assignment", {
    salary_structure: function(frm) {
        if (frm.doc.salary_structure) {
            // Fetch the Salary Structure document
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Salary Structure",
                    name: frm.doc.salary_structure
                },
                callback: function(r) {
                    if (r.message) {
                        // Set currency from Salary Structure
                        if (r.message.currency) {
                            frm.set_value("currency", r.message.currency);
                        }
                        
                        // Clear existing tables
                        frm.clear_table("earnings");
                        frm.clear_table("deductions");
                        
                        // Populate Earnings table
                        if (r.message.earnings) {
                            r.message.earnings.forEach(function(row) {
                                let earnings_row = frm.add_child("earnings");
                                // Copy all fields from the salary structure row
                                Object.keys(row).forEach(function(key) {
                                    if (key !== 'name' && key !== 'parent' && 
                                        key !== 'parenttype' && key !== 'parentfield' && 
                                        key !== 'idx' && key !== 'docstatus' && 
                                        key !== 'creation' && key !== 'modified' && 
                                        key !== 'modified_by' && key !== 'owner') {
                                        earnings_row[key] = row[key];
                                    }
                                });
                            });
                        }
                        
                        // Populate Deductions table
                        if (r.message.deductions) {
                            r.message.deductions.forEach(function(row) {
                                let deductions_row = frm.add_child("deductions");
                                // Copy all fields from the salary structure row
                                Object.keys(row).forEach(function(key) {
                                    if (key !== 'name' && key !== 'parent' && 
                                        key !== 'parenttype' && key !== 'parentfield' && 
                                        key !== 'idx' && key !== 'docstatus' && 
                                        key !== 'creation' && key !== 'modified' && 
                                        key !== 'modified_by' && key !== 'owner') {
                                        deductions_row[key] = row[key];
                                    }
                                });
                            });
                        }
                        
                        // Refresh the child tables to show the new data
                        frm.refresh_field("earnings");
                        frm.refresh_field("deductions");
                        
                        // Calculate totals
                        calculate_totals(frm);
                        
                        frappe.show_alert({
                            message: __('Earnings and Deductions populated from Salary Structure'),
                            indicator: 'green'
                        }, 5);
                    }
                }
            });
        } else {
            // If salary structure is cleared, clear the tables
            frm.clear_table("earnings");
            frm.clear_table("deductions");
            frm.refresh_field("earnings");
            frm.refresh_field("deductions");
            
            // Clear totals
            frm.set_value("total_earnings", 0);
            frm.set_value("total_deductions", 0);
            frm.set_value("gross_pay", 0);
            frm.set_value("net_in_hand", 0);
        }
    }
});

// Function to calculate totals
function calculate_totals(frm) {
    let total_earnings = 0;
    let total_deductions = 0;
    
    // Calculate total earnings
    if (frm.doc.earnings) {
        frm.doc.earnings.forEach(function(row) {
            total_earnings += flt(row.amount);
        });
    }
    
    // Calculate total deductions
    if (frm.doc.deductions) {
        frm.doc.deductions.forEach(function(row) {
            total_deductions += flt(row.amount);
        });
    }
    
    // Calculate gross pay (total earnings - total deductions)
    let gross_pay = total_earnings - total_deductions;
    
    // Net in hand is same as gross pay (you can modify this if needed)
    let net_in_hand = gross_pay;
    
    // Set the calculated values
    frm.set_value("total_earnings", total_earnings);
    frm.set_value("total_deductions", total_deductions);
    frm.set_value("gross_pay", gross_pay);
    frm.set_value("net_in_hand", net_in_hand);
}

// Recalculate totals when earnings or deductions table is modified
frappe.ui.form.on("Salary Details", {
    amount: function(frm, cdt, cdn) {
        calculate_totals(frm);
    },
    earnings_add: function(frm, cdt, cdn) {
        calculate_totals(frm);
    },
    earnings_remove: function(frm, cdt, cdn) {
        calculate_totals(frm);
    },
    deductions_add: function(frm, cdt, cdn) {
        calculate_totals(frm);
    },
    deductions_remove: function(frm, cdt, cdn) {
        calculate_totals(frm);
    }
});