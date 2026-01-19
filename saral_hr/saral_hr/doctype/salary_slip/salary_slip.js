frappe.ui.form.on("Salary Slip", {
    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }

        if (frm.doc.employee && frm.doc.start_date) {
            fetch_attendance_summary(frm);
        }
    },

    employee(frm) {
        if (!frm.doc.employee) return;

        frm.set_value("currency", "INR");
        frm.set_value("salary_structure", null);

        frm.clear_table("earnings");
        frm.clear_table("deductions");

        frm.set_value("total_earnings", 0);
        frm.set_value("total_deductions", 0);

        frm.refresh_fields();

        fetch_salary_and_attendance(frm);
    },

    start_date(frm) {
        if (!frm.doc.start_date) return;

        const d = frappe.datetime.str_to_obj(frm.doc.start_date);
        const last_day = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        frm.set_value("end_date", frappe.datetime.obj_to_str(last_day));

        if (frm.doc.employee) {
            fetch_attendance_summary(frm);
        }
    }
});


// ===============================
// FETCH SALARY STRUCTURE
// ===============================
function fetch_salary_and_attendance(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: { employee: frm.doc.employee },
        callback(r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure Assignment found");
                return;
            }

            const data = r.message;

            frm.set_value("salary_structure", data.salary_structure);

            frm.clear_table("earnings");
            frm.clear_table("deductions");

            data.earnings.forEach(row => {
                let e = frm.add_child("earnings");
                e.salary_component = row.salary_component;
                e.amount = row.amount;
                e.currency = frm.doc.currency;
            });

            data.deductions.forEach(row => {
                let d = frm.add_child("deductions");
                d.salary_component = row.salary_component;
                d.amount = row.amount;
                d.currency = frm.doc.currency;
            });

            calculate_totals(frm);
            frm.refresh_fields();
        }
    });

    if (frm.doc.start_date) {
        fetch_attendance_summary(frm);
    }
}


// ===============================
// CALCULATE TOTALS (REUSABLE)
// ===============================
function calculate_totals(frm) {
    let total_earnings = 0;
    let total_deductions = 0;

    (frm.doc.earnings || []).forEach(row => {
        total_earnings += row.amount || 0;
    });

    (frm.doc.deductions || []).forEach(row => {
        total_deductions += row.amount || 0;
    });

    frm.set_value("total_earnings", total_earnings);
    frm.set_value("total_deductions", total_deductions);
}


// ===============================
// CHILD TABLE EVENTS
// ===============================
frappe.ui.form.on("Salary Slip Earnings", {
    amount(frm) {
        calculate_totals(frm);
    },
    earnings_remove(frm) {
        calculate_totals(frm);
    }
});

frappe.ui.form.on("Salary Slip Deductions", {
    amount(frm) {
        calculate_totals(frm);
    },
    deductions_remove(frm) {
        calculate_totals(frm);
    }
});


// ===============================
// ATTENDANCE SUMMARY
// ===============================
function fetch_attendance_summary(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_summary",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            if (r.message) {
                frm.set_value("total_working_days", r.message.present_days || 0);
                frm.set_value("absent_days", r.message.absent_days || 0);
            }
        }
    });
}
