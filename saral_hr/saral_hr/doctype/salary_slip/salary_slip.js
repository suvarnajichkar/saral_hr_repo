frappe.ui.form.on("Salary Slip", {

    refresh(frm) {
        // Always keep INR as default
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }
    },

    employee(frm) {
        if (!frm.doc.employee) return;

        // Reset fields
        frm.set_value("currency", "INR");
        frm.set_value("salary_structure", null);
        frm.clear_table("earnings");
        frm.clear_table("deductions");
        frm.refresh_fields(["earnings", "deductions"]);

        // Fetch salary structure and attendance data
        fetch_salary_and_attendance(frm);
    },

    posting_date(frm) {
        // Recalculate attendance when posting date changes
        if (frm.doc.employee && frm.doc.posting_date) {
            fetch_salary_and_attendance(frm);
        }
    },

    currency(frm) {
        // Sync currency to child tables
        ["earnings", "deductions"].forEach(table => {
            (frm.doc[table] || []).forEach(row => {
                row.currency = frm.doc.currency;
            });
        });
        frm.refresh_fields(["earnings", "deductions"]);
    }
});

function fetch_salary_and_attendance(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: {
            employee: frm.doc.employee,
            posting_date: frm.doc.posting_date
        },
        callback: function (r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure Assignment found for this employee");
                return;
            }

            const data = r.message;

            // Restrict salary structure
            frm.set_query("salary_structure", () => {
                return {
                    filters: {
                        name: data.salary_structure
                    }
                };
            });

            frm.set_value("salary_structure", data.salary_structure);

            // Fill earnings
            data.earnings.forEach(row => {
                let e = frm.add_child("earnings");
                e.salary_component = row.salary_component;
                e.amount = row.amount;
                e.currency = frm.doc.currency;
            });

            // Fill deductions
            data.deductions.forEach(row => {
                let d = frm.add_child("deductions");
                d.salary_component = row.salary_component;
                d.amount = row.amount;
                d.currency = frm.doc.currency;
            });

            frm.refresh_fields(["earnings", "deductions"]);
        }
    });

    // Fetch attendance data
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_summary",
        args: {
            employee: frm.doc.employee,
            posting_date: frm.doc.posting_date
        },
        callback: function (r) {
            if (r.message) {
                frm.set_value("total_working_days", r.message.present_days);
                frm.set_value("absent_days", r.message.absent_days);
                frm.refresh_fields(["total_working_days", "absent_days"]);
            }
        }
    });
}