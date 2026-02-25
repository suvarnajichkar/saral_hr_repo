frappe.ui.form.on("Company Link", {

    refresh(frm) {
        if (frm.doc.is_active) {
            frm.page.set_indicator(__("Active"), "green");
        } else {
            frm.page.set_indicator(__("Inactive"), "gray");
        }

        if (frm.doc.employee && !frm.is_new()) {
            frm.add_custom_button(__("View All Records"), function () {
                frappe.set_route("List", "Company Link", {
                    employee: frm.doc.employee
                });
            });
        }

        if (!frm.is_new()) {
            refresh_company_fields(frm);
        }

        // Only show transfer warning once
        if (frm.is_new() && frm.doc.employee && !frm._transfer_warned) {
            frm._transfer_warned = true;
            check_and_warn_transfer(frm, frm.doc.employee);
        }
    },

    company(frm) {
        if (!frm.is_new()) {
            refresh_company_fields(frm);
        }
    },

    employee(frm) {
        const selected_employee = frm.doc.employee;
        if (!selected_employee || !frm.is_new()) return;
        if (frm._transfer_warned) return;
        frm._transfer_warned = true;
        check_and_warn_transfer(frm, selected_employee);
    },

    date_of_joining(frm) {
        if (!frm.is_new() || !frm.doc.employee || !frm.doc.date_of_joining) return;

        find_active_record(frm.doc.employee).then(record => {
            if (record) {
                const leaving = frappe.datetime.add_days(frm.doc.date_of_joining, -1);
                frappe.show_alert({
                    message: __(
                        "On save: <b>{0}</b> record will be archived with leaving date <b>{1}</b>",
                        [record.company, leaving]
                    ),
                    indicator: "blue"
                }, 6);
            }
        });
    },

    left_date(frm) {
        if (frm.doc.left_date && frm.doc.is_active) {
            frappe.msgprint(__("Employee has left. The record will be marked as inactive."));
            frm.set_value("is_active", 0);
        }
    }
});

function find_active_record(employee) {
    return frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Company Link",
            filters: [
                ["name", "like", employee + "%"],
                ["is_active", "=", 1]
            ],
            fields: ["name", "company", "employee", "is_active"],
            limit: 5
        }
    }).then(r => {
        if (r.message && r.message.length > 0) {
            return r.message[0];
        }
        return null;
    });
}

function check_and_warn_transfer(frm, employee) {
    find_active_record(employee).then(record => {
        if (record) {
            frappe.msgprint({
                title: __("Transfer Notice"),
                indicator: "blue",
                message: __(
                    "Employee is currently active in company {0}. " +
                    "Saving this record will automatically archive " +
                    "that record and transfer the employee here.",
                    [record.company]
                )
            });
        }
    }).catch(err => {
        console.error("Transfer check error:", err);
    });
}

function refresh_company_fields(frm) {
    if (!frm.doc.company || frm.is_new()) return;

    frappe.db.get_value(
        "Company",
        frm.doc.company,
        ["default_holiday_list"],
        (r) => {
            if (!r) return;

            if (r.default_holiday_list &&
                r.default_holiday_list !== frm.doc.holiday_list) {

                frm.set_value("holiday_list", r.default_holiday_list);

                setTimeout(() => {
                    if (frm.is_dirty()) {
                        frm.save().then(() => {
                            frappe.show_alert({
                                message: __("Company Link updated with latest Company settings"),
                                indicator: "green"
                            }, 3);
                        });
                    }
                }, 500);
            }
        }
    );
}