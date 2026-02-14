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

        refresh_company_fields(frm);
    },

    company(frm) {
        refresh_company_fields(frm);
    },

    employee(frm) {
        if (frm.doc.employee && frm.is_new()) {
            // Warn HR if employee already has an active record
            frappe.db.get_list("Company Link", {
                filters: {
                    employee: frm.doc.employee,
                    is_active: 1
                },
                fields: ["name", "company"]
            }).then(r => {
                if (r && r.length > 0) {
                    frappe.msgprint({
                        title: __("Transfer Notice"),
                        indicator: "blue",
                        message: __(
                            "Employee is currently active in company {0}. " +
                            "Saving this record will automatically archive " +
                            "that record and transfer the employee here.",
                            [r[0].company]
                        )
                    });
                }
            });
        }
    },

    left_date(frm) {
        if (frm.doc.left_date && frm.doc.is_active) {
            frappe.msgprint(__("Employee has left. The record will be marked as inactive."));
            frm.set_value("is_active", 0);
        }
    }
});

function refresh_company_fields(frm) {
    if (frm.doc.company && !frm.is_new()) {
        frappe.db.get_value(
            "Company",
            frm.doc.company,
            ["salary_calculation_based_on", "default_holiday_list"],
            (r) => {
                if (r) {
                    let fields_changed = false;

                    if (r.salary_calculation_based_on &&
                        r.salary_calculation_based_on !== frm.doc.salary_calculation_based_on) {
                        frm.set_value("salary_calculation_based_on", r.salary_calculation_based_on);
                        fields_changed = true;
                    }

                    if (r.default_holiday_list &&
                        r.default_holiday_list !== frm.doc.holiday_list) {
                        frm.set_value("holiday_list", r.default_holiday_list);
                        fields_changed = true;
                    }

                    if (fields_changed && !frm.is_dirty()) {
                        setTimeout(() => {
                            frm.save().then(() => {
                                frappe.show_alert({
                                    message: __('Company Link updated with latest Company settings'),
                                    indicator: 'green'
                                }, 3);
                            });
                        }, 500);
                    }
                }
            }
        );
    }
}
