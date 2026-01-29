frappe.ui.form.on("Salary Slip", {

    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }
        
        // Set default value for deduct_weekly_off_from_working_days if not set
        if (frm.doc.deduct_weekly_off_from_working_days === undefined) {
            frm.set_value("deduct_weekly_off_from_working_days", 1);
        }
    },

    employee(frm) {
        if (!frm.doc.employee) return;

        reset_form(frm);
        fetch_salary(frm);
    },

    start_date(frm) {
        if (!frm.doc.start_date) return;

        // ✅ Auto set end date = last day of same month
        set_end_date(frm);

        if (!frm.doc.employee) return;

        fetch_days_and_attendance(frm);
    },

    // ✅ FIXED: Recalculate when weekly off deduction option changes
    deduct_weekly_off_from_working_days(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        
        fetch_days_and_attendance(frm);
    }
});


// -------------------------
// SET END DATE (AUTO)
// -------------------------
function set_end_date(frm) {

    let startDate = frappe.datetime.str_to_obj(frm.doc.start_date);

    let lastDay = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0
    );

    frm.set_value(
        "end_date",
        frappe.datetime.obj_to_str(lastDay)
    );
}


// -------------------------
// FETCH SALARY STRUCTURE
// -------------------------
function fetch_salary(frm) {

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: {
            employee: frm.doc.employee
        },
        callback(r) {

            if (!r.message) {
                frappe.msgprint("No Salary Structure found");
                return;
            }

            frm.set_value("salary_structure", r.message.salary_structure);

            frm.clear_table("earnings");
            frm.clear_table("deductions");

            // ✅ FIXED: Store base_amount for each earning
            (r.message.earnings || []).forEach(row => {
                let e = frm.add_child("earnings");
                Object.assign(e, row);
                // Store original amount as base_amount
                e.base_amount = row.amount;
            });

            // ✅ FIXED: Store base_amount for each deduction
            (r.message.deductions || []).forEach(row => {
                let d = frm.add_child("deductions");
                Object.assign(d, row);
                // Store original amount as base_amount
                d.base_amount = row.amount;
            });

            frm.refresh_fields(["earnings", "deductions"]);
        }
    });
}


// -------------------------
// FETCH ATTENDANCE + DAYS
// -------------------------
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

            frm.set_value("total_working_days", d.working_days || 0);
            frm.set_value("payment_days", d.payment_days || 0);
            frm.set_value("present_days", d.present_days || 0);
            frm.set_value("absent_days", d.absent_days || 0);
            frm.set_value("weekly_offs_count", d.weekly_offs || 0);

            recalculate_salary(frm);
        }
    });
}


// -------------------------
// SALARY CALCULATION - FIXED
// -------------------------
function recalculate_salary(frm) {

    let gross = 0;
    let deductions = 0;
    let employer = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);

    // ✅ FIXED: Earnings - Always calculate from base_amount
    (frm.doc.earnings || []).forEach(row => {

        // Use base_amount if available, otherwise current amount
        let base_amt = row.base_amount || row.amount || 0;
        
        // Store base_amount if not already stored
        if (!row.base_amount) {
            row.base_amount = row.amount || 0;
        }

        let amt = base_amt;

        // Prorate based on payment days if needed
        if (row.depends_on_payment_days && wd > 0) {
            amt = (base_amt / wd) * pd;
        }

        // Update the amount field with calculated value
        row.amount = flt(amt, 2);
        gross += flt(row.amount);
    });

    // ✅ FIXED: Deductions - Always calculate from base_amount
    (frm.doc.deductions || []).forEach(row => {

        // Use base_amount if available, otherwise current amount
        let base_amt = row.base_amount || row.amount || 0;
        
        // Store base_amount if not already stored
        if (!row.base_amount) {
            row.base_amount = row.amount || 0;
        }

        let amt = base_amt;

        // Prorate based on payment days if needed
        if (row.depends_on_payment_days && wd > 0) {
            amt = (base_amt / wd) * pd;
        }

        // Update the amount field with calculated value
        row.amount = flt(amt, 2);

        if (row.employer_contribution) {
            employer += flt(row.amount);
        } else {
            deductions += flt(row.amount);
        }
    });

    frm.set_value({
        gross_salary: gross,
        total_earnings: gross,
        total_deductions: deductions,
        total_employer_contribution: employer,
        net_salary: gross - deductions,
        ctc: gross + employer
    });

    frm.refresh_fields(["earnings", "deductions"]);
}


// -------------------------
// RESET FORM
// -------------------------
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
        net_salary: 0,
        ctc: 0
    });

    frm.refresh_fields();
}