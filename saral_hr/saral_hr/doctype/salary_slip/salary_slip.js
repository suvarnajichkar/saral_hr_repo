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
                weekly_offs_count: d.weekly_offs
            });

            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {

    let gross_salary = 0;
    let employee_deductions = 0;
    let cash_in_hand_deductions = 0;
    let employer_contribution = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);

    let earnings_before_rounding = 0;

    // ================= EARNINGS =================
    // All earnings (type = "Earning") go to gross_salary
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

        earnings_before_rounding += amount;
        row.amount = flt(amount, 2);
        gross_salary += row.amount;
    });

    // ================= DEDUCTIONS =================
    // Process deductions based on flags:
    // 1. employer_contribution = 1 → add to employer_contribution (not employee deduction)
    // 2. deduct_from_cash_in_hand_only = 1 → add to cash_in_hand_deductions (not employee deduction)
    // 3. Otherwise → add to employee_deductions
    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = (row.depends_on_payment_days && wd > 0)
            ? (base / wd) * pd
            : base;

        row.amount = flt(amount, 2);

        // Flag 1: Employer contribution
        if (row.employer_contribution) {
            employer_contribution += row.amount;
            return;
        }

        // Flag 2: Deduct from cash in hand only
        if (row.deduct_from_cash_in_hand_only) {
            cash_in_hand_deductions += row.amount;
            return;
        }

        // Flag 3: Regular employee deduction
        // These are PF Employee, ESIC Employee, PT, LWF (employee portion), etc.
        employee_deductions += row.amount;
    });

    // ================= ROUNDING =================
    let carried_forward = flt(earnings_before_rounding - gross_salary, 2);
    let brought_forward = flt(frm.doc.previous_carry_forward || 0);
    let total_earnings = gross_salary + brought_forward;

    // ================= FINAL TOTALS =================
    // Net Salary = Gross Salary - Employee Deductions
    let net_salary = flt(gross_salary - employee_deductions, 2);
    
    // Cash in Hand = Net Salary - Cash in Hand Deductions
    let cash_in_hand = flt(net_salary - cash_in_hand_deductions, 2);
    
    // Monthly CTC = Gross Salary + Employer Contribution
    let monthly_ctc = flt(gross_salary + employer_contribution, 2);
    
    // Annual CTC = Monthly CTC × 12
    let annual_ctc = flt(monthly_ctc * 12, 2);

    frm.set_value({
        gross_salary,
        total_earnings,
        brought_forward,
        carried_forward,
        total_deductions: employee_deductions,
        total_employer_contribution: employer_contribution,
        cash_in_hand_deductions,
        net_salary,
        cash_in_hand,
        monthly_ctc,
        annual_ctc
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
        gross_salary: 0,
        total_earnings: 0,
        brought_forward: 0,
        carried_forward: 0,
        total_deductions: 0,
        total_employer_contribution: 0,
        cash_in_hand_deductions: 0,
        net_salary: 0,
        cash_in_hand: 0,
        monthly_ctc: 0,
        annual_ctc: 0
    });

    frm.variable_pay_percentage = 0;
    frm.refresh_fields();
}