frappe.ui.form.on("Salary Slip", {
    refresh: function(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }
        if (frm.doc.employee && frm.doc.start_date) {
            fetch_attendance_summary(frm);
        }
    },

    employee: function(frm) {
        if (!frm.doc.employee) return;

        frm.set_value("currency", "INR");
        frm.set_value("salary_structure", null);
        frm.clear_table("earnings");
        frm.clear_table("deductions");
        frm.refresh_fields(["earnings", "deductions"]);

        fetch_salary_and_attendance(frm);
    },

    currency: function(frm) {
        ["earnings", "deductions"].forEach(table => {
            (frm.doc[table] || []).forEach(row => {
                row.currency = frm.doc.currency;
            });
        });
        frm.refresh_fields(["earnings", "deductions"]);
    },

    start_date: function(frm) {
        if (frm.doc.start_date) {
            const date = frappe.datetime.str_to_obj(frm.doc.start_date);
            const year = date.getFullYear();
            const month = date.getMonth();
            const last_day = new Date(year, month + 1, 0);
            const last_day_str = frappe.datetime.obj_to_str(last_day);
            frm.set_value('end_date', last_day_str);

            if (frm.doc.employee) {
                setTimeout(() => {
                    fetch_attendance_summary(frm);
                }, 500);
            }
        }
    }
});

function fetch_salary_and_attendance(frm) {
    if (!frm.doc.employee) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: { employee: frm.doc.employee },
        callback: function (r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure Assignment found for this employee");
                return;
            }

            const data = r.message;
            frm.set_query("salary_structure", () => {
                return { filters: { name: data.salary_structure } };
            });
            frm.set_value("salary_structure", data.salary_structure);

            frm.clear_table("earnings");
            frm.clear_table("deductions");

            let total_earnings = 0;
            let total_deductions = 0;

            data.earnings.forEach(row => {
                let e = frm.add_child("earnings");
                e.salary_component = row.salary_component;
                e.amount = row.amount;
                e.currency = frm.doc.currency;
                total_earnings += row.amount || 0;
            });

            data.deductions.forEach(row => {
                let d = frm.add_child("deductions");
                d.salary_component = row.salary_component;
                d.amount = row.amount;
                d.currency = frm.doc.currency;
                total_deductions += row.amount || 0;
            });

            frm.set_value("total_earnings", total_earnings);
            frm.set_value("total_deductions", total_deductions);

            frm.refresh_fields(["earnings", "deductions", "total_earnings", "total_deductions"]);
        }
    });

    if (frm.doc.start_date) {
        setTimeout(() => {
            fetch_attendance_summary(frm);
        }, 500);
    }
}

function fetch_attendance_summary(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_summary",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback: function (r) {
            if (r.message) {
                const data = r.message;
                frm.set_value("total_working_days", data.present_days || 0);
                frm.set_value("absent_days", data.absent_days || 0);
                frappe.show_alert({
                    message: __('Attendance updated: {0} working days, {1} absent days',
                        [data.present_days || 0, data.absent_days || 0]),
                    indicator: 'green'
                }, 3);
            }
        }
    });
}