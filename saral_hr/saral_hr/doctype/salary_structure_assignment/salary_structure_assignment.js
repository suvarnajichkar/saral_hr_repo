// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Salary Structure Assignment", {

    setup(frm) {
        // 🔒 Show ONLY active employees (Company Link)
        frm.set_query("employee", function () {
            return {
                filters: {
                    is_active: 1
                }
            };
        });
    },

    salary_structure(frm) {
        if (!frm.doc.salary_structure) {
            frm.clear_table("earnings");
            frm.clear_table("deductions");
            frm.refresh_fields(["earnings", "deductions"]);

            frm.set_value({
                total_earnings: 0,
                total_deductions: 0,
                gross_pay: 0,
                net_in_hand: 0
            });
            return;
        }

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Salary Structure",
                name: frm.doc.salary_structure
            },
            callback: function (r) {
                if (!r.message) return;

                // Currency
                if (r.message.currency) {
                    frm.set_value("currency", r.message.currency);
                }

                frm.clear_table("earnings");
                frm.clear_table("deductions");

                // Earnings
                (r.message.earnings || []).forEach(row => {
                    let child = frm.add_child("earnings");
                    copy_row(child, row);
                });

                // Deductions
                (r.message.deductions || []).forEach(row => {
                    let child = frm.add_child("deductions");
                    copy_row(child, row);
                });

                frm.refresh_fields(["earnings", "deductions"]);
                calculate_totals(frm);

                frappe.show_alert({
                    message: __("Earnings and Deductions populated from Salary Structure"),
                    indicator: "green"
                }, 5);
            }
        });
    }
});

// 🔁 Child table recalculation
frappe.ui.form.on("Salary Details", {
    amount(frm) {
        calculate_totals(frm);
    },
    earnings_add(frm) {
        calculate_totals(frm);
    },
    earnings_remove(frm) {
        calculate_totals(frm);
    },
    deductions_add(frm) {
        calculate_totals(frm);
    },
    deductions_remove(frm) {
        calculate_totals(frm);
    }
});

// ---------------- HELPERS ----------------

function calculate_totals(frm) {
    let total_earnings = 0;
    let total_deductions = 0;

    (frm.doc.earnings || []).forEach(r => {
        total_earnings += flt(r.amount);
    });

    (frm.doc.deductions || []).forEach(r => {
        total_deductions += flt(r.amount);
    });

    let gross_pay = total_earnings - total_deductions;

    frm.set_value({
        total_earnings,
        total_deductions,
        gross_pay,
        net_in_hand: gross_pay
    });
}

function copy_row(target, source) {
    Object.keys(source).forEach(key => {
        if (![
            "name", "parent", "parenttype", "parentfield",
            "idx", "docstatus", "creation", "modified",
            "modified_by", "owner"
        ].includes(key)) {
            target[key] = source[key];
        }
    });
}
