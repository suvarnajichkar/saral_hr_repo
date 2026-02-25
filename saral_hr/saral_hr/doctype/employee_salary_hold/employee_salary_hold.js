// employee_salary_hold.js
// Client-side controller for Employee Salary Hold DocType

frappe.ui.form.on("Employee Salary Hold", {

    // -----------------------------------------------------------------------
    // Form setup
    // -----------------------------------------------------------------------
    setup(frm) {
        frm.set_query("salary_slip", () => {
            return frm._salary_slip_query || { filters: { employee: frm.doc.employee || "" } };
        });
    },

    refresh(frm) {
        frm.trigger("set_field_visibility");
        frm.trigger("add_custom_buttons");
        frm.trigger("set_status_indicator");
        frm.trigger("refresh_salary_slip_query");
    },

    // -----------------------------------------------------------------------
    // Field events
    // -----------------------------------------------------------------------
    employee(frm) {
        if (!frm.doc.employee) return;

        // Check if employee is already on hold
        frappe.call({
            method: "saral_hr.saral_hr.doctype.employee_salary_hold.employee_salary_hold.get_hold_status",
            args: { employee: frm.doc.employee },
            callback(r) {
                if (r.message && r.message.name) {
                    frappe.msgprint({
                        title: __("Warning"),
                        indicator: "orange",
                        message: __(
                            "Employee <b>{0}</b> already has an active Salary Hold: "
                            + "<a href='/app/employee-salary-hold/{1}'>{1}</a>",
                            [frm.doc.employee_name || frm.doc.employee, r.message.name]
                        )
                    });
                }
            }
        });

        // Auto-fill current month / year
        const now    = new Date();
        const months = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
        frm.set_value("month", months[now.getMonth()]);
        frm.set_value("year",  String(now.getFullYear()));

        // Clear any previously selected salary slip
        frm.set_value("salary_slip", "");
        frm.trigger("refresh_salary_slip_query");
    },

    month(frm) {
        frm.set_value("salary_slip", "");
        frm.trigger("refresh_salary_slip_query");
    },

    year(frm) {
        frm.set_value("salary_slip", "");
        frm.trigger("refresh_salary_slip_query");
    },

    status(frm) {
        frm.trigger("set_field_visibility");
        frm.trigger("set_status_indicator");
    },

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    refresh_salary_slip_query(frm) {
        if (!frm.doc.employee || !frm.doc.month || !frm.doc.year) {
            frm._salary_slip_query = { filters: { employee: frm.doc.employee || "" } };
            return;
        }

        const month_map = {
            "January":1,"February":2,"March":3,"April":4,
            "May":5,"June":6,"July":7,"August":8,
            "September":9,"October":10,"November":11,"December":12
        };
        const m          = month_map[frm.doc.month];
        const start_date = `${frm.doc.year}-${String(m).padStart(2,"0")}-01`;

        frm._salary_slip_query = {
            filters: {
                employee:   frm.doc.employee,
                start_date: start_date,
                docstatus:  ["in", [0, 1]]
            }
        };

        frm.trigger("show_available_slips");
    },

    show_available_slips(frm) {
        /**
         * Show clickable chips below the salary_slip field.
         * Green chip = Submitted, Orange chip = Draft.
         * Click a chip to auto-select that slip.
         */
        if (!frm.doc.employee || !frm.doc.month || !frm.doc.year) return;

        frappe.call({
            method: "saral_hr.saral_hr.doctype.employee_salary_hold.employee_salary_hold.get_salary_slips_for_employee",
            args: {
                employee: frm.doc.employee,
                month:    frm.doc.month,
                year:     frm.doc.year
            },
            callback(r) {
                const slips   = r.message || [];
                const wrapper = frm.fields_dict.salary_slip.$wrapper;

                wrapper.find(".slip-hint").remove();

                if (!slips.length) {
                    wrapper.append(`
                        <div class="slip-hint" style="margin-top:4px;font-size:11px;color:var(--text-muted);">
                            ⚠ No salary slips found for ${frm.doc.month} ${frm.doc.year}
                        </div>`);
                    return;
                }

                const chips = slips.map(s => {
                    const color  = s.status_label === "Submitted" ? "#2f9e44" : "#e67700";
                    const bg     = s.status_label === "Submitted" ? "#ebfbee"  : "#fff3cd";
                    const border = s.status_label === "Submitted" ? "#2f9e44"  : "#e67700";
                    return `
                        <span class="slip-chip"
                            data-slip="${frappe.utils.escape_html(s.name)}"
                            style="display:inline-flex;align-items:center;gap:6px;
                                padding:3px 10px;border-radius:20px;cursor:pointer;
                                border:1px solid ${border};background:${bg};
                                color:${color};font-size:11px;font-weight:600;
                                margin:2px 4px 2px 0;">
                            ${frappe.utils.escape_html(s.name)}
                            <span style="font-weight:400;font-size:10px;">(${s.status_label})</span>
                        </span>`;
                }).join("");

                wrapper.append(`
                    <div class="slip-hint" style="margin-top:6px;">
                        <span style="font-size:11px;color:var(--text-muted);margin-right:4px;">
                            Available slips:
                        </span>
                        ${chips}
                    </div>`);

                // Click chip → auto-select that slip
                wrapper.find(".slip-chip").on("click", function() {
                    frm.set_value("salary_slip", $(this).data("slip"));
                });
            }
        });
    },

    set_field_visibility(frm) {
        const is_released = frm.doc.status === "Released";
        frm.toggle_display("release_date",   is_released);
        frm.toggle_display("release_reason", is_released);
        frm.toggle_reqd("release_date",      is_released);
        frm.toggle_reqd("release_reason",    is_released);
    },

    set_status_indicator(frm) {
        if (!frm.doc.__islocal) {
            const color = frm.doc.status === "On Hold" ? "red" : "green";
            frm.page.set_indicator(__(frm.doc.status), color);
        }
    },

    add_custom_buttons(frm) {
        frm.clear_custom_buttons();

        if (frm.doc.docstatus === 1 && frm.doc.status === "On Hold") {
            frm.add_custom_button(__("Release Hold"), () => {
                frm.trigger("show_release_dialog");
            }, __("Actions")).addClass("btn-success");
        }

        if (frm.doc.salary_slip) {
            frm.add_custom_button(__("View Salary Slip"), () => {
                frappe.set_route("Form", "Salary Slip", frm.doc.salary_slip);
            }, __("Links"));
        }
    },

    show_release_dialog(frm) {
        const d = new frappe.ui.Dialog({
            title: __("Release Salary Hold"),
            fields: [
                {
                    fieldname: "release_date",
                    fieldtype: "Date",
                    label: __("Release Date"),
                    default: frappe.datetime.get_today(),
                    reqd: 1
                },
                {
                    fieldname: "release_reason",
                    fieldtype: "Small Text",
                    label: __("Reason for Release"),
                    reqd: 1
                }
            ],
            primary_action_label: __("Release"),
            primary_action({ release_date, release_reason }) {
                frappe.call({
                    method: "saral_hr.saral_hr.doctype.employee_salary_hold.employee_salary_hold.release_salary_hold",
                    args: {
                        hold_name:      frm.doc.name,
                        release_date,
                        release_reason
                    },
                    freeze: true,
                    freeze_message: __("Releasing salary hold..."),
                    callback(r) {
                        d.hide();
                        if (r.message) {
                            frappe.show_alert({
                                message: __("Salary hold released. New record: {0}", [r.message]),
                                indicator: "green"
                            });
                            frappe.set_route("Form", "Employee Salary Hold", r.message);
                        }
                    }
                });
            }
        });
        d.show();
    }
});


// ---------------------------------------------------------------------------
// List view — colour-code rows by status
// ---------------------------------------------------------------------------
frappe.listview_settings["Employee Salary Hold"] = {
    add_fields: ["status"],

    get_indicator(doc) {
        if (doc.status === "On Hold")  return [__("On Hold"),  "red",   "status,=,On Hold"];
        if (doc.status === "Released") return [__("Released"), "green", "status,=,Released"];
    },

    onload(listview) {
        listview.page.add_action_item(__("Release Selected"), () => {
            const selected = listview.get_checked_items();
            if (!selected.length) {
                frappe.msgprint(__("Please select at least one record."));
                return;
            }

            const on_hold = selected.filter(r => r.status === "On Hold" && r.docstatus === 1);
            if (!on_hold.length) {
                frappe.msgprint(__("No submitted 'On Hold' records selected."));
                return;
            }

            const d = new frappe.ui.Dialog({
                title: __("Bulk Release Salary Hold"),
                fields: [
                    {
                        fieldname: "release_date",
                        fieldtype: "Date",
                        label: __("Release Date"),
                        default: frappe.datetime.get_today(),
                        reqd: 1
                    },
                    {
                        fieldname: "release_reason",
                        fieldtype: "Small Text",
                        label: __("Reason for Release"),
                        reqd: 1
                    }
                ],
                primary_action_label: __("Release All"),
                primary_action({ release_date, release_reason }) {
                    d.hide();
                    const promises = on_hold.map(rec =>
                        frappe.call({
                            method: "saral_hr.saral_hr.doctype.employee_salary_hold.employee_salary_hold.release_salary_hold",
                            args: { hold_name: rec.name, release_date, release_reason }
                        })
                    );
                    Promise.all(promises).then(() => {
                        frappe.show_alert({
                            message: __("{0} hold(s) released successfully.", [on_hold.length]),
                            indicator: "green"
                        });
                        listview.refresh();
                    });
                }
            });
            d.show();
        });
    }
};