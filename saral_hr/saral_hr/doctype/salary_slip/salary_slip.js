frappe.listview_settings['Salary Slip'] = {
    onload: function(listview) {
        listview.page.add_inner_button(__('Bulk Generate Salary Slips'), function() {
            show_bulk_salary_slip_dialog();
        });

        listview.page.add_inner_button(__('Bulk Print Salary Slips'), function() {
            show_bulk_print_dialog();
        });

        listview.page.add_inner_button(__('Draft to Submit'), function() {
            show_draft_to_submit_dialog();
        });
    }
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function get_year_options() {
    let current_year = new Date().getFullYear();
    let years = [];
    for (let i = current_year - 2; i <= current_year + 1; i++) {
        years.push(i.toString());
    }
    return years;
}

function get_current_month() {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[new Date().getMonth()];
}

// ─── Card Grid Renderer ───────────────────────────────────────────────────────

function render_card_grid(dialog, html_field, card_class, count_id, search_id, items) {
    dialog._card_items = dialog._card_items || {};
    dialog._card_items[html_field] = items;

    const wrapper = dialog.fields_dict[html_field].$wrapper;

    const html = `
        <div style="margin-bottom: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <input
                id="${search_id}"
                type="text"
                class="form-control"
                placeholder="Search by name or ID..."
                style="flex: 1; min-width: 160px; max-width: 320px;"
            >
            <button class="btn btn-xs btn-default" id="${search_id}_select_all">
                ${__('Select All')}
            </button>
            <button class="btn btn-xs btn-default" id="${search_id}_deselect_all">
                ${__('Deselect All')}
            </button>
            <span id="${count_id}" class="text-muted" style="font-size: 12px; margin-left: 4px;">
                0 selected
            </span>
        </div>
        <div
            id="${search_id}_grid"
            style="
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                max-height: 380px;
                overflow-y: auto;
                padding: 4px 2px;
            "
        >
            ${build_cards(items, card_class)}
        </div>
    `;

    wrapper.html(html);

    wrapper.find(`#${search_id}`).on('input', function() {
        const q = $(this).val().toLowerCase().trim();
        const all = dialog._card_items[html_field];
        const filtered = q
            ? all.filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
            : all;
        wrapper.find(`#${search_id}_grid`).html(build_cards(filtered, card_class));
        bind_card_events(wrapper, card_class, count_id, search_id);
        update_count(wrapper, card_class, count_id);
    });

    wrapper.find(`#${search_id}_select_all`).on('click', function() {
        wrapper.find(`.${card_class}`).prop('checked', true);
        update_count(wrapper, card_class, count_id);
    });

    wrapper.find(`#${search_id}_deselect_all`).on('click', function() {
        wrapper.find(`.${card_class}`).prop('checked', false);
        update_count(wrapper, card_class, count_id);
    });

    bind_card_events(wrapper, card_class, count_id, search_id);
    update_count(wrapper, card_class, count_id);
}

function build_cards(items, card_class) {
    if (!items || items.length === 0) {
        return `<div class="text-muted" style="padding: 20px; width: 100%; text-align: center;">
                    No records found.
                </div>`;
    }

    return items.map(item => `
        <label style="
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            width: calc(33.33% - 8px);
            min-width: 140px;
            border: 1px solid var(--border-color, #d1d8dd);
            border-radius: 6px;
            padding: 10px 12px;
            cursor: pointer;
            background: var(--card-bg, #fff);
            transition: border-color 0.15s, box-shadow 0.15s;
            box-sizing: border-box;
            gap: 4px;
        "
        onmouseover="this.style.borderColor='var(--primary, #5e64ff)'; this.style.boxShadow='0 0 0 2px var(--primary-light, #eef0ff)'"
        onmouseout="this.style.borderColor='var(--border-color, #d1d8dd)'; this.style.boxShadow='none'"
        >
            <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                <input
                    type="checkbox"
                    class="${card_class}"
                    data-id="${frappe.utils.escape_html(item.id)}"
                    data-name="${frappe.utils.escape_html(item.name)}"
                    style="cursor: pointer; margin: 0; flex-shrink: 0;"
                >
                <span style="
                    font-weight: 600;
                    font-size: 12px;
                    color: var(--text-color, #1f272e);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100%;
                ">${frappe.utils.escape_html(item.name)}</span>
            </div>
            <span style="
                font-size: 11px;
                color: var(--text-muted, #8d99a6);
                padding-left: 22px;
            ">${frappe.utils.escape_html(item.id)}</span>
        </label>
    `).join('');
}

function bind_card_events(wrapper, card_class, count_id, search_id) {
    wrapper.find(`.${card_class}`).off('change').on('change', function() {
        update_count(wrapper, card_class, count_id);
    });
}

function update_count(wrapper, card_class, count_id) {
    const count = wrapper.find(`.${card_class}:checked`).length;
    wrapper.find(`#${count_id}`).text(count + ' selected');
}

function get_checked_ids(dialog, html_field, card_class) {
    const ids = [];
    dialog.fields_dict[html_field].$wrapper.find(`.${card_class}:checked`).each(function() {
        ids.push({
            id: $(this).data('id'),
            name: $(this).data('name')
        });
    });
    return ids;
}

// ─── Bulk Generate ────────────────────────────────────────────────────────────

function show_bulk_salary_slip_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Bulk Generate Salary Slips'),
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: 'Year',
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString()
            },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: 'Month',
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month()
            },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_employees',
                fieldtype: 'Button',
                label: 'Fetch Employees',
                click: function() { fetch_eligible_employees(d); }
            },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'employees_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Generate Salary Slips'),
        primary_action: function() { generate_bulk_salary_slips(d); }
    });
    d.show();
}

function fetch_eligible_employees(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company)       { frappe.msgprint(__('Please select Company'));        return; }
    if (!year || !month){ frappe.msgprint(__('Please select Year and Month')); return; }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_eligible_employees_for_salary_slip',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                const items = r.message.map(emp => ({
                    id:   emp.name,
                    name: emp.employee_name || emp.name
                }));
                render_card_grid(
                    dialog,
                    'employees_html',
                    'emp-card-check',
                    'emp_selected_count',
                    'emp_search',
                    items
                );
            } else {
                dialog.fields_dict.employees_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No eligible employees found for the selected period.</div>'
                );
            }
        }
    });
}

function generate_bulk_salary_slips(dialog) {
    let company  = dialog.get_value('company');
    let year     = dialog.get_value('year');
    let month    = dialog.get_value('month');
    let selected = get_checked_ids(dialog, 'employees_html', 'emp-card-check');

    if (selected.length === 0) {
        frappe.msgprint(__('Please select at least one employee'));
        return;
    }

    frappe.confirm(
        `Are you sure you want to generate salary slips for <b>${selected.length}</b> employee(s)?`,
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Generating Salary Slips... Please wait...'));

            const employees = selected.map(s => ({ employee: s.id, employee_name: s.name }));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_generate_salary_slips',
                args: { employees, year, month },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        show_result_dialog(__('Bulk Generation Result'), r.message, 'Successfully Created');
                        cur_list.refresh();
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to generate salary slips.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Bulk Print ───────────────────────────────────────────────────────────────

function show_bulk_print_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Bulk Print Salary Slips'),
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: 'Year',
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString()
            },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: 'Month',
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month()
            },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_slips',
                fieldtype: 'Button',
                label: 'Fetch Salary Slips',
                click: function() { fetch_submitted_salary_slips(d); }
            },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'slips_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Print Selected Slips'),
        primary_action: function() { print_selected_salary_slips(d); }
    });
    d.show();
}

function fetch_submitted_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company)       { frappe.msgprint(__('Please select Company'));        return; }
    if (!year || !month){ frappe.msgprint(__('Please select Year and Month')); return; }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_submitted_salary_slips',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                const items = r.message.map(slip => ({
                    id:   slip.name,
                    name: slip.employee_name || slip.employee
                }));
                render_card_grid(
                    dialog,
                    'slips_html',
                    'slip-card-check',
                    'slip_selected_count',
                    'slip_search',
                    items
                );
            } else {
                dialog.fields_dict.slips_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No submitted salary slips found for the selected period.</div>'
                );
            }
        }
    });
}

function print_selected_salary_slips(dialog) {
    let selected = get_checked_ids(dialog, 'slips_html', 'slip-card-check');

    if (selected.length === 0) {
        frappe.msgprint(__('Please select at least one salary slip'));
        return;
    }

    frappe.confirm(
        `Are you sure you want to print <b>${selected.length}</b> salary slip(s)?`,
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Generating PDF... Please wait...'));

            const salary_slip_names = selected.map(s => s.id);

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_print_salary_slips',
                args: { salary_slip_names },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        window.open(r.message.pdf_url, '_blank');
                        frappe.msgprint({ title: __('Print Ready'), message: `${selected.length} salary slip(s) prepared for printing.`, indicator: 'green' });
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to generate PDF.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Draft to Submit ──────────────────────────────────────────────────────────

function show_draft_to_submit_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Submit Draft Salary Slips'),
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: 'Year',
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString()
            },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: 'Month',
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month()
            },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_drafts',
                fieldtype: 'Button',
                label: 'Fetch Draft Slips',
                click: function() { fetch_draft_salary_slips(d); }
            },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'drafts_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Submit Selected Slips'),
        primary_action: function() { submit_selected_salary_slips(d); }
    });
    d.show();
}

function fetch_draft_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company)       { frappe.msgprint(__('Please select Company'));        return; }
    if (!year || !month){ frappe.msgprint(__('Please select Year and Month')); return; }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_draft_salary_slips',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                const items = r.message.map(slip => ({
                    id:   slip.name,
                    name: slip.employee_name || slip.employee
                }));
                render_card_grid(
                    dialog,
                    'drafts_html',
                    'draft-card-check',
                    'draft_selected_count',
                    'draft_search',
                    items
                );
            } else {
                dialog.fields_dict.drafts_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No draft salary slips found for the selected period.</div>'
                );
            }
        }
    });
}

function submit_selected_salary_slips(dialog) {
    let selected = get_checked_ids(dialog, 'drafts_html', 'draft-card-check');

    if (selected.length === 0) {
        frappe.msgprint(__('Please select at least one salary slip'));
        return;
    }

    frappe.confirm(
        `Are you sure you want to submit <b>${selected.length}</b> salary slip(s)?`,
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Submitting salary slips... Please wait...'));

            const salary_slip_names = selected.map(s => s.id);

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_submit_salary_slips',
                args: { salary_slip_names },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        show_result_dialog(__('Bulk Submission Result'), r.message, 'Successfully Submitted');
                        cur_list.refresh();
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to submit salary slips.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Result Dialog ────────────────────────────────────────────────────────────

function show_result_dialog(title, result, success_label) {
    let msg = `
        <table class="table table-bordered" style="margin-bottom: 0;">
            <tr>
                <td><strong>${success_label}:</strong></td>
                <td style="color: var(--green); font-weight: bold;">${result.success}</td>
            </tr>
            <tr>
                <td><strong>Failed:</strong></td>
                <td style="color: var(--red); font-weight: bold;">${result.failed}</td>
            </tr>
        </table>
    `;

    if (result.errors && result.errors.length > 0) {
        msg += '<div style="margin-top: 12px;"><strong>Errors:</strong><ul style="margin-top: 4px;">';
        result.errors.forEach(e => { msg += `<li>${e}</li>`; });
        msg += '</ul></div>';
    }

    frappe.msgprint({ title, message: msg, indicator: result.failed > 0 ? 'orange' : 'green' });
}

// ─── Form Events ──────────────────────────────────────────────────────────────

frappe.ui.form.on("Salary Slip", {
    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }
        frm.set_query("employee", () => {
            return { filters: { is_active: 1 } };
        });
    },

    employee(frm) {
        if (!frm.doc.employee) return;
        reset_form(frm);
        if (frm.doc.start_date) {
            check_duplicate_and_fetch(frm);
        }
    },

    start_date(frm) {
        if (!frm.doc.start_date) return;
        set_end_date(frm);
        if (frm.doc.employee) {
            check_duplicate_and_fetch(frm);
        }
    },

    working_days_calculation_method(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        fetch_days_and_attendance(frm);
    }
});

frappe.ui.form.on("Salary Details", {
    amount(frm) { recalculate_salary(frm); },
    earnings_remove(frm) { recalculate_salary(frm); },
    deductions_remove(frm) { recalculate_salary(frm); }
});

// ─── Core Form Functions ──────────────────────────────────────────────────────

function check_duplicate_and_fetch(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.check_duplicate_salary_slip",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date,
            current_doc: frm.doc.name || ""
        },
        callback(r) {
            if (r.message && r.message.status === "duplicate") {
                frappe.msgprint(r.message.message);
                frm.set_value("start_date", "");
                return;
            }
            fetch_salary(frm);
        }
    });
}

function set_end_date(frm) {
    let start = frappe.datetime.str_to_obj(frm.doc.start_date);
    let end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    frm.set_value("end_date", frappe.datetime.obj_to_str(end));
}

function fetch_salary(frm) {
    // Reset save button before each fresh fetch
    frm.page.btn_primary.prop('disabled', false);

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            if (!r.message) {
                frappe.msgprint({
                    title: __('No Salary Structure'),
                    message: __('No Salary Structure found for this employee.'),
                    indicator: 'red'
                });
                frm.page.btn_primary.prop('disabled', true);
                // Stop here — do NOT proceed to variable pay or attendance checks
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

            // ── Step 2: Check Variable Pay Assignment ─────────────────────
            frappe.call({
                method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.check_variable_pay_assignment",
                args: {
                    employee: frm.doc.employee,
                    start_date: frm.doc.start_date
                },
                callback(vr) {
                    if (vr.message && vr.message.status === "missing") {
                        frappe.msgprint({
                            title: __('No Variable Pay Assignment'),
                            message: vr.message.message,
                            indicator: 'orange'
                        });
                        frm.page.btn_primary.prop('disabled', true);
                        // Still fetch attendance so the HR can see day counts
                        // but saving is blocked until assignment is created
                        fetch_days_and_attendance(frm);
                        return;
                    }

                    // ── Step 3: Variable pay exists — fetch percentage then attendance ──
                    fetch_variable_pay_percentage(frm);
                    fetch_days_and_attendance(frm);
                }
            });
        }
    });
}

function fetch_variable_pay_percentage(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) {
        recalculate_salary(frm);
        return;
    }

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_variable_pay_percentage",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            frm.variable_pay_percentage = flt(r.message || 0) / 100;
            recalculate_salary(frm);
        }
    });
}

function fetch_days_and_attendance(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_and_days",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date,
            working_days_calculation_method: frm.doc.working_days_calculation_method
        },
        callback(r) {
            if (!r.message) return;

            // Disable save if no attendance records found
            if (r.message.attendance_count === 0) {
                frappe.msgprint({
                    title: __('No Attendance Found'),
                    message: __(
                        'No attendance records found for employee <b>{0}</b> for the selected month. Salary Slip cannot be processed.',
                        [frm.doc.employee_name || frm.doc.employee]
                    ),
                    indicator: 'red'
                });
                frm.page.btn_primary.prop('disabled', true);
                return;
            }

            // Re-enable in case a previous check had disabled it
            frm.page.btn_primary.prop('disabled', false);

            let d = r.message;
            frm.set_value({
                total_working_days: d.working_days,
                payment_days: d.payment_days,
                present_days: d.present_days,
                absent_days: d.absent_days,
                weekly_offs_count: d.weekly_offs,
                total_half_days: d.total_half_days,
                total_lwp: d.total_lwp || 0,
                total_holidays: d.total_holidays || 0
            });

            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {
    let total_earnings = 0;
    let total_deductions = 0;
    let total_basic_da = 0;
    let total_employer_contribution = 0;
    let retention = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);

    let basic_amount = 0;
    let da_amount = 0;
    let conveyance_amount = 0;

    (frm.doc.earnings || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;

        if (row.salary_component && row.salary_component.toLowerCase().includes("variable")) {
            if (wd > 0 && row.depends_on_payment_days) {
                amount = (base / wd) * pd * variable_pct;
            } else {
                amount = base * variable_pct;
            }
        } else {
            if (row.depends_on_payment_days && wd > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);
        total_earnings += row.amount;

        let comp = (row.salary_component || "").toLowerCase();
        if (comp.includes("basic"))                            basic_amount      = row.amount;
        if (comp.includes("da") || comp.includes("dearness")) da_amount         = row.amount;
        if (comp.includes("conveyance"))                       conveyance_amount = row.amount;
    });

    total_basic_da = basic_amount + da_amount;

    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;
        let comp = (row.salary_component || "").toLowerCase();

        if (comp.includes("esic") && !comp.includes("employer")) {
            amount = base > 0 && total_earnings < 21000
                ? flt((total_earnings - conveyance_amount) * 0.0075, 2)
                : 0;
        } else if (comp.includes("esic") && comp.includes("employer")) {
            amount = base > 0 && total_earnings < 21000
                ? flt((total_earnings - conveyance_amount) * 0.0325, 2)
                : 0;
        } else if (comp.includes("pf") || comp.includes("provident")) {
            if (base > 0) {
                let basic_da_total = basic_amount + da_amount;
                amount = basic_da_total >= 15000 ? 1800 : flt(basic_da_total * 0.12, 2);
            }
        } else {
            if (row.depends_on_payment_days && wd > 0 && base > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);

        if (row.employer_contribution) {
            total_employer_contribution += row.amount;
        } else {
            total_deductions += row.amount;
        }

        if (comp.includes("retention")) retention += row.amount;
    });

    let net_salary = flt(total_earnings - total_deductions, 2);

    frm.set_value({
        total_earnings: flt(total_earnings, 2),
        total_deductions: flt(total_deductions, 2),
        net_salary: net_salary,
        total_basic_da: flt(total_basic_da, 2),
        total_employer_contribution: flt(total_employer_contribution, 2),
        retention: flt(retention, 2)
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
        total_half_days: 0,
        total_lwp: 0,
        total_holidays: 0,
        total_earnings: 0,
        total_deductions: 0,
        net_salary: 0,
        total_basic_da: 0,
        total_employer_contribution: 0,
        retention: 0
    });

    frm.variable_pay_percentage = 0;

    // Re-enable save button on reset so fresh selection starts clean
    frm.page.btn_primary.prop('disabled', false);

    frm.refresh_fields();
}