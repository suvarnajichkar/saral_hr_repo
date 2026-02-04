frappe.ui.form.on("Salary Slip", {
    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }

        // Show only active employees
        frm.set_query("employee", () => {
            return {
                filters: { is_active: 1 }
            };
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
        
        // Re-fetch salary structure when start_date changes to add/remove LWF
        if (frm.doc.employee) {
            fetch_salary(frm);
        }
        
        if (!frm.doc.employee) return;
        fetch_days_and_attendance(frm);
    },

    working_days_calculation_method(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        fetch_days_and_attendance(frm);
    }
});

// Event handler for Earnings and Deductions child tables
frappe.ui.form.on("Salary Details", {
    amount(frm, cdt, cdn) {
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
            recalculate_salary(frm);
        }
    });
}

function fetch_days_and_attendance(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_and_days",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date,
            working_days_calculation_method: frm.doc.working_days_calculation_method || "Exclude Weekly Offs"
        },
        callback(r) {
            if (!r.message) return;

            let d = r.message;
            frm.set_value("total_working_days", d.working_days);
            frm.set_value("payment_days", d.payment_days);
            frm.set_value("present_days", d.present_days);
            frm.set_value("absent_days", d.absent_days);
            frm.set_value("weekly_offs_count", d.weekly_offs);

            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {
    let gross = 0;
    let employee_deductions = 0;
    let employer_contribution = 0;
    let retention = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);

    // ========== EARNINGS CALCULATION ==========
    (frm.doc.earnings || []).forEach(row => {
        let base = row.base_amount || row.amount || 0;
        row.base_amount = base;

        // Pro-rata calculation based on payment days
        let amount;
        if (row.depends_on_payment_days && wd > 0) {
            amount = (base / wd) * pd;
        } else {
            amount = base;
        }

        row.amount = flt(amount, 2);
        gross += row.amount;
    });

    // ========== DEDUCTIONS CATEGORIZATION ==========
    (frm.doc.deductions || []).forEach(row => {
        let base = row.base_amount || row.amount || 0;
        row.base_amount = base;

        // Pro-rata calculation based on payment days
        let amount = row.depends_on_payment_days && wd > 0
            ? (base / wd) * pd
            : base;

        row.amount = flt(amount, 2);

        // CRITICAL LOGIC:
        // 1. First check if it's employer contribution
        // 2. Then check if component name is "Retention" AND has deduct_from_cash_in_hand_only flag
        // 3. Otherwise treat as regular employee deduction

        if (row.employer_contribution) {
            // Employer contributions: Employer ESIC, Employer PF, Bonus, Gratuity, Employer - Labour Welfare Fund
            employer_contribution += row.amount;
        } else if (row.deduct_from_cash_in_hand_only && row.salary_component === 'Retention') {
            // ONLY "Retention" component goes here
            // NOT part of total deductions, only deducted from cash in hand
            retention += row.amount;
        } else {
            // Regular employee deductions: Employee ESIC, Employee PF, Professional Tax, Employee - Labour Welfare Fund
            // These ARE part of total deductions
            employee_deductions += row.amount;
        }
    });

    // ========== FINAL CALCULATIONS ==========
    // Total Deductions = ONLY employee deductions (NOT including retention)
    let total_deductions = employee_deductions;

    // Net Salary = Gross - Total Deductions
    let net_salary = gross - total_deductions;

    // Cash in Hand = Net Salary - Retention
    let cash_in_hand = net_salary - retention;

    // Monthly CTC = Gross + Employer Contribution
    let monthly_ctc = gross + employer_contribution;

    // Annual CTC = Monthly CTC × 12
    let annual_ctc = monthly_ctc * 12;

    frm.set_value({
        gross_salary: gross,
        total_earnings: gross,
        total_deductions: total_deductions,
        total_employer_contribution: employer_contribution,
        retention: retention,
        net_salary: net_salary,
        cash_in_hand: cash_in_hand,
        monthly_ctc: monthly_ctc,
        annual_ctc: annual_ctc
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