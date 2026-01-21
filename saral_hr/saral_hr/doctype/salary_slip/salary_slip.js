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
        frm.set_value("gross_salary", 0);
        frm.set_value("total_employer_contribution", 0);
        frm.set_value("ctc", 0);
        frm.set_value("net_salary", 0);

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
                e.abbr = row.abbr;
                e.amount = row.amount;
                e.currency = frm.doc.currency;
            });

            data.deductions.forEach(row => {
                let d = frm.add_child("deductions");
                d.salary_component = row.salary_component;
                d.abbr = row.abbr;
                d.amount = row.amount;
                d.employer_contribution = row.employer_contribution || 0;
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

function calculate_totals(frm) {
    let gross_salary = 0;
    let employee_deductions = 0;
    let employer_contribution = 0;

    (frm.doc.earnings || []).forEach(row => {
        gross_salary += row.amount || 0;
    });

    (frm.doc.deductions || []).forEach(row => {
        if (row.employer_contribution) {
            employer_contribution += row.amount || 0;
        } else {
            employee_deductions += row.amount || 0;
        }
    });

    frm.set_value("gross_salary", gross_salary);
    frm.set_value("total_earnings", gross_salary);
    frm.set_value("total_deductions", employee_deductions);
    frm.set_value("total_employer_contribution", employer_contribution);
    frm.set_value("ctc", gross_salary + employer_contribution);
    frm.set_value("net_salary", gross_salary - employee_deductions);
}

frappe.ui.form.on("Salary Details", {
    amount(frm) {
        calculate_totals(frm);
    },
    salary_details_remove(frm) {
        calculate_totals(frm);
    }
});

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
