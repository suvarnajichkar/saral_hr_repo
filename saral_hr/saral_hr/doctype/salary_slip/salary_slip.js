frappe.ui.form.on("Salary Slip", {
    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }

        frm.set_query("employee", () => {
            return { filters: { is_active: 1 } };
        });
    },

    employee(frm) {
        if (!frm.doc.employee) return;
        reset_form(frm);
        fetch_salary(frm);
    },

    start_date(frm) {
        if (!frm.doc.start_date) return;
        set_end_date(frm);

        if (frm.doc.employee) {
            fetch_salary(frm);
            fetch_days_and_attendance(frm);
        }
    },

    working_days_calculation_method(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        fetch_days_and_attendance(frm);
    }
});

frappe.ui.form.on("Salary Details", {
    amount(frm) {
        recalculate_salary(frm);
    },
    earnings_remove(frm) {
        recalculate_salary(frm);
    },
    deductions_remove(frm) {
        recalculate_salary(frm);
    }
});

function set_end_date(frm) {
    let start = frappe.datetime.str_to_obj(frm.doc.start_date);
    let end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    frm.set_value("end_date", frappe.datetime.obj_to_str(end));
}

function fetch_salary(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure found");
                return;
            }

            frm.set_value("salary_structure", r.message.salary_structure);
            frm.clear_table("earnings");
            frm.clear_table("deductions");

            (r.message.earnings || []).forEach(row => {
                let e = frm.add_child("earnings");
                Object.assign(e, row);
                e.base_amount = row.amount;
            });

            (r.message.deductions || []).forEach(row => {
                let d = frm.add_child("deductions");
                Object.assign(d, row);
                d.base_amount = row.amount;
            });

            frm.refresh_fields(["earnings", "deductions"]);
            fetch_variable_pay_percentage(frm);
            fetch_days_and_attendance(frm);
        }
    });
}

function fetch_variable_pay_percentage(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) {
        recalculate_salary(frm);
        return;
    }

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_variable_pay_percentage",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            frm.variable_pay_percentage = flt(r.message || 0) / 100;
            recalculate_salary(frm);
        }
    });
}

function fetch_days_and_attendance(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_and_days",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date,
            working_days_calculation_method: frm.doc.working_days_calculation_method
        },
        callback(r) {
            if (!r.message) return;

            let d = r.message;
            frm.set_value({
                total_working_days: d.working_days,
                payment_days: d.payment_days,
                present_days: d.present_days,
                absent_days: d.absent_days,
                weekly_offs_count: d.weekly_offs,
                total_half_days: d.total_half_days
            });

            recalculate_salary(frm);
        }
    });
}

/**
 * Check if component name matches Professional Tax pattern.
 * Handles variations like: PT, P.T, P T, Professional Tax, Prof Tax, Profess Tax, etc.
 */
function is_professional_tax(component_name) {
    if (!component_name) return false;
    
    // Normalize: lowercase, remove extra spaces, dots, underscores, hyphens
    let normalized = component_name.toLowerCase()
        .replace(/[.\s_-]+/g, ' ')
        .trim();
    
    // Pattern matches:
    // - "pt" or "p t"
    // - "professional tax" or "professionaltax"
    // - "prof tax" or "proftax"
    // - "profess tax" or "professtax"
    // - Any variation with spaces/dots/underscores/hyphens
    const patterns = [
        /^p\s*t$/,                          // PT, P T, P.T, etc.
        /^professional\s*tax$/,             // Professional Tax
        /^prof\s*tax$/,                     // Prof Tax
        /^profess\s*tax$/,                  // Profess Tax
        /^profession\s*tax$/,               // Profession Tax
        /^prof\s*t$/,                       // Prof T
        /^profess\s*t$/                     // Profess T
    ];
    
    return patterns.some(pattern => pattern.test(normalized));
}

/**
 * Professional Tax February hardcoded rule (mirrors Python logic).
 * - Only applies to components matching Professional Tax pattern.
 * - Only applies when the SSA base_amount > 0.
 * - If the slip month is February (month index 1), returns 300.
 * - Otherwise returns base_amount unchanged.
 */
function apply_professional_tax_february_rule(component_name, base_amount, start_date) {
    if (!is_professional_tax(component_name)) {
        return base_amount;
    }
    
    if (flt(base_amount) <= 0) {
        return base_amount;  // SSA amount is 0 — no change
    }

    if (start_date) {
        let date_obj = frappe.datetime.str_to_obj(start_date);
        if (date_obj.getMonth() === 1) {  // January=0, February=1
            return 300;
        }
    }

    return base_amount;
}

function recalculate_salary(frm) {
    let total_earnings = 0;
    let total_deductions = 0;
    let total_basic_da = 0;
    let total_employer_contribution = 0;
    let retention = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);

    let basic_amount = 0;
    let da_amount = 0;
    let conveyance_amount = 0;

    // ================= EARNINGS =================
    (frm.doc.earnings || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;

        if (row.salary_component &&
            row.salary_component.toLowerCase().includes("variable")) {

            if (wd > 0 && row.depends_on_payment_days) {
                amount = (base / wd) * pd * variable_pct;
            } else {
                amount = base * variable_pct;
            }
        } else {
            if (row.depends_on_payment_days && wd > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);
        total_earnings += row.amount;

        let comp = (row.salary_component || "").toLowerCase();

        if (comp.includes("basic")) {
            basic_amount = row.amount;
        }
        if (comp.includes("da") || comp.includes("dearness")) {
            da_amount = row.amount;
        }
        if (comp.includes("conveyance")) {
            conveyance_amount = row.amount;
        }
    });

    total_basic_da = basic_amount + da_amount;

    // ================= DEDUCTIONS =================
    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;
        let comp = (row.salary_component || "").toLowerCase();

        // ===== PROFESSIONAL TAX - February hardcoded rule =====
        if (is_professional_tax(row.salary_component)) {
            amount = apply_professional_tax_february_rule(
                row.salary_component, base, frm.doc.start_date
            );
        }
        // ===== ESIC EMPLOYEE =====
        else if (comp.includes("esic") && !comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0075, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // ===== ESIC EMPLOYER =====
        else if (comp.includes("esic") && comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0325, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // ===== PF (Both Employee and Employer) =====
        else if (comp.includes("pf") || comp.includes("provident")) {
            if (base > 0) {
                if (pd === wd) {
                    amount = base;
                } else {
                    let prorated_basic_da = basic_amount + da_amount;
                    let pf_wages = Math.min(prorated_basic_da, 15000);
                    amount = flt(pf_wages * 0.12, 2);
                }
            } else {
                amount = 0;
            }
        }
        // ===== Other Deductions (LWF, etc.) =====
        else {
            if (row.depends_on_payment_days && wd > 0 && base > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);

        if (row.employer_contribution) {
            total_employer_contribution += row.amount;
        } else {
            total_deductions += row.amount;
        }

        if (comp.includes("retention")) {
            retention += row.amount;
        }
    });

    let net_salary = flt(total_earnings - total_deductions, 2);

    frm.set_value({
        total_earnings: flt(total_earnings, 2),
        total_deductions: flt(total_deductions, 2),
        net_salary: net_salary,
        total_basic_da: flt(total_basic_da, 2),
        total_employer_contribution: flt(total_employer_contribution, 2),
        retention: flt(retention, 2)
    });

    frm.refresh_fields(["earnings", "deductions"]);
}

function reset_form(frm) {
    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
        total_working_days: 0,
        payment_days: 0,
        present_days: 0,
        absent_days: 0,
        weekly_offs_count: 0,
        total_half_days: 0,
        total_earnings: 0,
        total_deductions: 0,
        net_salary: 0,
        total_basic_da: 0,
        total_employer_contribution: 0,
        retention: 0
    });

    frm.variable_pay_percentage = 0;
    frm.refresh_fields();
}