frappe.ui.form.on("Salary Structure Assignment", {

    refresh(frm) {
        calculate_totals(frm);
    },

    setup(frm) {
        frm.set_query("employee", () => ({
            filters: { is_active: 1 }
        }));
    },

    salary_structure(frm) {
        if (!frm.doc.salary_structure) {
            clear_salary_tables(frm);
            return;
        }

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Salary Structure",
                name: frm.doc.salary_structure
            },
            callback(r) {
                if (!r.message) return;

                clear_salary_tables(frm);

                (r.message.earnings || []).forEach(row => {
                    let e = frm.add_child("earnings");
                    copy_row(e, row);
                });

                (r.message.deductions || []).forEach(row => {
                    let d = frm.add_child("deductions");
                    copy_row(d, row);
                });

                frm.set_value("currency", r.message.currency || "INR");
                frm.refresh_fields(["earnings", "deductions"]);

                calculate_totals(frm);
            }
        });
    }
});

frappe.ui.form.on("Salary Details", {

    amount(frm, cdt, cdn) {
        calculate_totals(frm);
    },

    salary_details_remove(frm, cdt, cdn) {
        calculate_totals(frm);
    }
});

function calculate_totals(frm) {

    let gross = 0;
    let employee_deductions = 0;
    let employer_contribution = 0;
    let retention = 0;

    (frm.doc.earnings || []).forEach(row => {
        gross += flt(row.amount);
    });

    let deductions = frm.doc.deductions || [];

    if (!deductions.length) {
        set_totals(frm, gross, 0, 0, 0);
        return;
    }

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Salary Component",
            fields: ["name", "employer_contribution", "deduct_from_cash_in_hand_only"],
            filters: {
                name: ["in", deductions.map(d => d.salary_component)]
            }
        },
        callback(res) {

            let component_map = {};
            (res.message || []).forEach(r => {
                component_map[r.name] = {
                    employer_contribution: r.employer_contribution,
                    deduct_from_cash_in_hand_only: r.deduct_from_cash_in_hand_only
                };
            });

            deductions.forEach(d => {
                let comp = component_map[d.salary_component];
                if (!comp) return;

                if (comp.employer_contribution) {
                    employer_contribution += flt(d.amount);
                } else if (comp.deduct_from_cash_in_hand_only) {
                    retention += flt(d.amount);
                } else {
                    employee_deductions += flt(d.amount);
                }
            });

            set_totals(frm, gross, employee_deductions, employer_contribution, retention);
        }
    });
}

function set_totals(frm, gross, deductions, employer, retention) {

    let net_salary = gross - deductions;
    let cash_in_hand = net_salary - retention;
    let monthly_ctc = gross + employer;
    let annual_ctc = monthly_ctc * 12;

    frm.set_value({
        total_earnings: gross,
        gross_salary: gross,
        total_deductions: deductions,
        total_employer_contribution: employer,
        retention: retention,
        net_salary: net_salary,
        cash_in_hand: cash_in_hand,
        monthly_ctc: monthly_ctc,
        annual_ctc: annual_ctc
    });
}

function clear_salary_tables(frm) {

    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
        total_earnings: 0,
        gross_salary: 0,
        total_deductions: 0,
        total_employer_contribution: 0,
        retention: 0,
        net_salary: 0,
        cash_in_hand: 0,
        monthly_ctc: 0,
        annual_ctc: 0
    });

    frm.refresh_fields();
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