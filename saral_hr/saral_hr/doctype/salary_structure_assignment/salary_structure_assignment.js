frappe.ui.form.on("Salary Structure Assignment", {

    refresh(frm) {
        calculate_salary(frm);
    },

    setup(frm) {
    // Filter active employees
    frm.set_query("employee", () => ({
        filters: { is_active: 1 }
    }));

    // Filter Salary Structure by Company
    frm.set_query("salary_structure", () => {
        if (!frm.doc.company) {
            return {};
        }
        return {
            filters: {
                company: frm.doc.company,
                is_active: "Yes"
            }
        };
    });
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

    amount(frm) {
        calculate_salary(frm);
    },

    salary_details_remove(frm) {
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
            let employee_deductions = 0;  // ESIC (0.75%) + PF (12%) + PT
            let employer_contribution = 0; // ESIC (3.25%) + PF (12%) + Bonus + Gratuity
            let retention = 0;             // Retention - NOT part of total deductions

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

                // CRITICAL PRIORITY ORDER:
                // 1. Check if component name is exactly "Retention"
                //    → Retention (NOT in total deductions, only deducted from cash in hand)
                // 2. THEN check "employer_contribution"
                //    → Employer contribution (doesn't affect employee)
                // 3. Otherwise → Regular employee deduction (part of total deductions)
                //    Note: Employee PF, PT, ESIC have "deduct_from_cash_in_hand_only" = 1
                //    but they ARE still part of total deductions

                if (is_cash_only === 1 && d.salary_component === 'Retention') {
                    // ONLY Retention component: NOT part of total deductions
                    // Only deducted from cash in hand
                    retention += amount;
                }
                else if (is_employer === 1) {
                    // Employer contribution: ESIC (3.25%), PF (12%), Bonus, Gratuity
                    employer_contribution += amount;
                }
                else {
                    // Regular employee deduction: ESIC (0.75%), PF (12%), PT
                    // These ARE part of total deductions
                    // (Even if deduct_from_cash_in_hand_only = 1)
                    employee_deductions += amount;
                }
            });

            // 4️⃣ Calculate and set all totals
            set_salary_totals(
                frm,
                gross_salary,
                employee_deductions,
                employer_contribution,
                retention
            );
        }
    });
}

function set_salary_totals(frm, gross, employee_deductions, employer, retention) {

    // ============================================================
    // FINAL FORMULAS:
    // ============================================================
    // GROSS SALARY = Basic + DA + HRA + Conveyance + Medical + Education + Other Allowance + Variable Pay
    //
    // TOTAL DEDUCTIONS = ESIC (0.75%) + PF (12%) + PT
    //                    Does NOT include retention
    //
    // NET SALARY = Gross Salary - Total Deductions
    //
    // RETENTION = Tracked separately
    //             (Only the "Retention" component)
    //
    // CASH IN HAND = Net Salary - Retention
    //              = Gross - Total Deductions - Retention
    //
    // TOTAL EMPLOYER CONTRIBUTION = ESIC (3.25%) + PF (12%) + Bonus + Gratuity
    //
    // ANNUAL CTC = (Gross Salary × 12) + (Total Employer Contribution × 12)
    //
    // MONTHLY CTC = Annual CTC ÷ 12
    // ============================================================

    // Total Deductions = ONLY employee deductions (NOT including retention)
    let total_deductions = employee_deductions;  // ✅ NO RETENTION HERE

    // Net Salary = Gross - Total Deductions
    let net_salary = gross - total_deductions;

    // Cash in Hand = Net Salary - Retention
    let cash_in_hand = net_salary - retention;

    // Annual CTC = (Gross × 12) + (Employer Contribution × 12)
    let annual_ctc = (gross * 12) + (employer * 12);

    // Monthly CTC = Annual CTC ÷ 12
    let monthly_ctc = annual_ctc / 12;

    frm.set_value({
        gross_salary: gross,
        total_deductions: total_deductions,          // ✅ ONLY employee deductions (NO retention)
        total_employer_contribution: employer,        // Employer ESIC + PF + Bonus + Gratuity
        retention: retention,                         // Tracked separately
        net_salary: net_salary,                       // Gross - Total Deductions
        cash_in_hand: cash_in_hand,                   // Net Salary - Retention
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