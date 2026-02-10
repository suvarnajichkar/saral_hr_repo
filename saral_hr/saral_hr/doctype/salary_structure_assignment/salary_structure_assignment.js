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

    // ── 1. Total Earnings + Basic/DA = sum of all earning rows (no proration) ─
    let total_earnings  = 0;
    let basic_amount    = 0;
    let da_amount       = 0;

    (frm.doc.earnings || []).forEach(row => {
        let amount = flt(row.amount);
        total_earnings += amount;

        let comp = (row.salary_component || "").toLowerCase();
        if (comp.includes("basic"))                          basic_amount = amount;
        if (comp.includes(" da") || comp.includes("dearness") || comp === "da") da_amount = amount;
    });

    let total_basic_da = basic_amount + da_amount;

    let deductions = frm.doc.deductions || [];

    // If no deductions, set totals and return early
    if (!deductions.length) {
        set_salary_totals(frm, total_earnings, total_basic_da, 0, 0, 0);
        return;
    }

    // ── 2. Fetch component flags from Salary Component master ─────────────────
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

            let employee_deductions   = 0;   // ESIC (0.75%) + PF (12%) + PT
            let employer_contribution = 0;   // ESIC (3.25%) + PF (12%) + Bonus + Gratuity
            let retention             = 0;   // Retention component (tracked separately)

            // ── 3. Categorise each deduction row ─────────────────────────────
            deductions.forEach(d => {
                let comp   = component_map[d.salary_component];
                let amount = flt(d.amount);

                if (!comp) {
                    // Unknown component → treat as regular employee deduction
                    employee_deductions += amount;
                    return;
                }

                let is_cash_only = parseInt(comp.deduct_from_cash_in_hand_only) || 0;
                let is_employer  = parseInt(comp.employer_contribution) || 0;

                if (is_cash_only === 1 && d.salary_component === "Retention") {
                    // Retention: NOT part of Total Deductions, tracked separately
                    retention += amount;
                } else if (is_employer === 1) {
                    // Employer contribution
                    employer_contribution += amount;
                } else {
                    // Regular employee deduction (ESIC, PF, PT …)
                    employee_deductions += amount;
                }
            });

            // ── 4. Set all totals ─────────────────────────────────────────────
            set_salary_totals(
                frm,
                total_earnings,
                total_basic_da,
                employee_deductions,
                employer_contribution,
                retention
            );
        }
    });
}

function set_salary_totals(frm, total_earnings, total_basic_da, employee_deductions, employer_contribution, retention) {

    // ============================================================
    // FORMULAS (mirrors Salary Slip — no proration on SSA)
    // ============================================================
    // TOTAL EARNINGS           = Sum of all earning rows
    // TOTAL (BASIC + DA)       = Basic amount + DA amount from earnings
    // TOTAL DEDUCTIONS         = Employee deductions (ESIC 0.75% + PF 12% + PT)
    //                            Does NOT include Retention or Employer Contributions
    // NET SALARY               = Total Earnings − Total Deductions
    // RETENTION                = Tracked separately (Retention component only)
    // TOTAL EMPLOYER CONTRIB   = ESIC 3.25% + PF 12% + Bonus + Gratuity
    // MONTHLY CTC              = Total Earnings + Total Employer Contribution
    // ANNUAL CTC               = Monthly CTC × 12
    // ============================================================

    let total_deductions = employee_deductions;                       // no retention here
    let net_salary       = total_earnings - total_deductions;
    let monthly_ctc      = total_earnings + employer_contribution;
    let annual_ctc       = monthly_ctc * 12;

    frm.set_value({
        total_earnings:              total_earnings,
        total_basic_da:              total_basic_da,
        total_deductions:            total_deductions,
        net_salary:                  net_salary,
        total_employer_contribution: employer_contribution,
        retention:                   retention,
        monthly_ctc:                 monthly_ctc,
        annual_ctc:                  annual_ctc
    });

    frm.refresh_fields();
}

function clear_salary_tables(frm) {

    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
        total_earnings:              0,
        total_basic_da:              0,
        total_deductions:            0,
        net_salary:                  0,
        total_employer_contribution: 0,
        retention:                   0,
        monthly_ctc:                 0,
        annual_ctc:                  0
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