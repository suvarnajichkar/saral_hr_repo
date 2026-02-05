frappe.ui.form.on("Salary Structure Assignment", {

    refresh(frm) {
        calculate_salary(frm);
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

                calculate_salary(frm);
            }
        });
    }
});

frappe.ui.form.on("Salary Details", {

    amount(frm, cdt, cdn) {
        // Allow manual editing of amounts
        calculate_salary(frm);
    },

    earnings_remove(frm) {
        calculate_salary(frm);
    },

    deductions_remove(frm) {
        calculate_salary(frm);
    }
});

function calculate_salary(frm) {

    let gross_salary = 0;

    // 1️⃣ Gross Salary = Sum of all Earnings
    (frm.doc.earnings || []).forEach(row => {
        gross_salary += flt(row.amount);
    });

    let deductions = frm.doc.deductions || [];
    
    // If no deductions, set totals and return
    if (!deductions.length) {
        set_salary_totals(frm, gross_salary, 0, 0, 0);
        return;
    }

    // 2️⃣ Fetch component flags from Salary Component master
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Salary Component",
            fields: [
                "name",
                "employer_contribution",
                "deduct_from_cash_in_hand_only"
            ],
            filters: {
                name: ["in", deductions.map(d => d.salary_component)]
            }
        },
        callback(res) {

            let component_map = {};
            (res.message || []).forEach(c => {
                component_map[c.name] = c;
            });

            // Initialize variables inside callback
            let employee_deductions = 0;  // Employee PF + Employee ESIC + PT + Employee LWF
            let employer_contribution = 0; // Employer PF + Employer ESIC + Employer LWF + Bonus + Gratuity
            let cash_in_hand_deductions = 0; // Advance + Retention

            // 3️⃣ Categorize each deduction based on flags
            deductions.forEach(d => {
                let comp = component_map[d.salary_component];
                let amount = flt(d.amount);

                if (!comp) {
                    // If component not found, treat as regular employee deduction
                    employee_deductions += amount;
                    return;
                }

                // Convert to integer to handle both 0/1 and "0"/"1"
                let is_cash_only = parseInt(comp.deduct_from_cash_in_hand_only) || 0;
                let is_employer = parseInt(comp.employer_contribution) || 0;

                // PRIORITY ORDER:
                // 1. employer_contribution = 1 → Employer contribution (Employer PF, Employer ESIC, Employer LWF, Bonus, Gratuity)
                // 2. deduct_from_cash_in_hand_only = 1 → Cash in hand deduction (Advance, Retention)
                // 3. Otherwise → Regular employee deduction (Employee PF, Employee ESIC, PT, Employee LWF)

                if (is_employer === 1) {
                    // Employer contribution: Employer PF, Employer ESIC, Employer LWF, Bonus, Gratuity
                    employer_contribution += amount;
                }
                else if (is_cash_only === 1) {
                    // Cash in hand deductions: Advance, Retention
                    cash_in_hand_deductions += amount;
                }
                else {
                    // Regular employee deduction: Employee PF, Employee ESIC, PT, Employee LWF
                    employee_deductions += amount;
                }
            });

            // 4️⃣ Calculate and set all totals
            set_salary_totals(
                frm,
                gross_salary,
                employee_deductions,
                employer_contribution,
                cash_in_hand_deductions
            );
        }
    });
}

function set_salary_totals(frm, gross, employee_deductions, employer, cash_in_hand_deductions) {

    // ============================================================
    // FINAL FORMULAS:
    // ============================================================
    // GROSS SALARY = Basic + DA + HRA + Conveyance + Medical + Education + Other Allowance + Variable Pay + Arrears
    //
    // TOTAL DEDUCTIONS = Employee PF + Employee ESIC + PT + Employee LWF
    //
    // NET SALARY = Gross Salary - Total Deductions
    //
    // CASH IN HAND DEDUCTIONS = Advance + Retention
    //
    // CASH IN HAND = Net Salary - Cash in Hand Deductions
    //
    // TOTAL EMPLOYER CONTRIBUTION = Employer PF + Employer ESIC + Employer LWF + Bonus + Gratuity
    //
    // MONTHLY CTC = Gross Salary + Employer Contribution
    //
    // ANNUAL CTC = Monthly CTC × 12
    // ============================================================

    // Total Deductions = Employee deductions only
    let total_deductions = employee_deductions;

    // Net Salary = Gross - Total Deductions
    let net_salary = gross - total_deductions;

    // Cash in Hand = Net Salary - Cash in Hand Deductions
    let cash_in_hand = net_salary - cash_in_hand_deductions;

    // Monthly CTC = Gross + Employer Contribution
    let monthly_ctc = gross + employer;

    // Annual CTC = Monthly CTC × 12
    let annual_ctc = monthly_ctc * 12;

    frm.set_value({
        gross_salary: gross,
        total_deductions: total_deductions,
        total_employer_contribution: employer,
        retention: cash_in_hand_deductions, // For backward compatibility
        net_salary: net_salary,
        cash_in_hand: cash_in_hand,
        monthly_ctc: monthly_ctc,
        annual_ctc: annual_ctc
    });

    frm.refresh_fields();
}

function clear_salary_tables(frm) {

    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
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