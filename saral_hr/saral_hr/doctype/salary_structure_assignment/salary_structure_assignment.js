frappe.ui.form.on("Salary Structure Assignment", {

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
    amount(frm) {
        calculate_totals(frm);
    },
    salary_details_remove(frm) {
        calculate_totals(frm);
    }
});


function calculate_totals(frm) {

    let total_earnings = 0;
    let total_deductions = 0;
    let employer_contribution = 0;

    (frm.doc.earnings || []).forEach(r => {
        total_earnings += flt(r.amount);
    });

    let deduction_rows = frm.doc.deductions || [];
    let components = deduction_rows.map(r => r.salary_component);

    if (!components.length) {
        set_totals(frm, total_earnings, 0, 0);
        return;
    }

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Salary Component",
            fields: ["name", "employer_contribution"],
            filters: { name: ["in", components] },
            limit_page_length: 100
        },
        callback(res) {

            let map = {};
            (res.message || []).forEach(r => {
                map[r.name] = r.employer_contribution;
            });

            deduction_rows.forEach(r => {
                if (map[r.salary_component]) {
                    employer_contribution += flt(r.amount);
                } else {
                    total_deductions += flt(r.amount);
                }
            });

            set_totals(frm, total_earnings, total_deductions, employer_contribution);
        }
    });
}


function set_totals(frm, earnings, deductions, employer) {

    let gross_salary = earnings;
    let net_salary = earnings - deductions;
    let ctc = gross_salary + employer;

    frm.set_value({
        total_earnings: earnings,
        gross_salary: gross_salary,
        total_deductions: deductions,
        total_employer_contribution: employer,
        net_salary: net_salary,
        net_in_hand: net_salary,
        ctc: ctc
    });
}


function clear_salary_tables(frm) {

    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
        total_earnings: 0,
        total_deductions: 0,
        gross_salary: 0,
        total_employer_contribution: 0,
        net_salary: 0,
        net_in_hand: 0,
        ctc: 0
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
