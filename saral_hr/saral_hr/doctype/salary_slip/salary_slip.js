frappe.ui.form.on("Salary Slip", {

    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }

        if (frm.doc.deduct_weekly_off_from_working_days === undefined) {
            frm.set_value("deduct_weekly_off_from_working_days", 1);
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
        if (!frm.doc.employee) return;
        fetch_days_and_attendance(frm);
    },

    deduct_weekly_off_from_working_days(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        fetch_days_and_attendance(frm);
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
        args: { employee: frm.doc.employee },
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
            deduct_weekly_off: frm.doc.deduct_weekly_off_from_working_days ? 1 : 0
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

    // Earnings
    (frm.doc.earnings || []).forEach(row => {
        let base = row.base_amount || row.amount || 0;
        row.base_amount = base;

        let amount = row.depends_on_payment_days && wd > 0
            ? (base / wd) * pd
            : base;

        row.amount = flt(amount, 2);
        gross += row.amount;
    });

    // Deductions categorization
    (frm.doc.deductions || []).forEach(row => {
        let base = row.base_amount || row.amount || 0;
        row.base_amount = base;

        let amount = row.depends_on_payment_days && wd > 0
            ? (base / wd) * pd
            : base;

        row.amount = flt(amount, 2);

        if (row.employer_contribution) {
            employer_contribution += row.amount;
        } else if (row.deduct_from_cash_in_hand_only) {
            retention += row.amount;
        } else {
            employee_deductions += row.amount;
        }
    });

    let net_salary = gross - employee_deductions;
    let cash_in_hand = net_salary - retention;
    let monthly_ctc = gross + employer_contribution;
    let annual_ctc = monthly_ctc * 12;

    frm.set_value({
        gross_salary: gross,
        total_earnings: gross,
        total_deductions: employee_deductions,
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
