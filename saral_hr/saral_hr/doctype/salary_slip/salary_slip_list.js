frappe.listview_settings['Salary Slip'] = {
    onload: function(listview) {
        listview.page.add_inner_button(__('Bulk Generate Salary Slips'), () => show_bulk_salary_slip_dialog());
        listview.page.add_inner_button(__('Bulk Print Salary Slips'), () => show_bulk_print_dialog());
        listview.page.add_inner_button(__('Draft to Submit'), () => show_draft_to_submit_dialog());
    }
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function get_year_options() {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1].map(String);
}

function get_current_month() {
    return ['January','February','March','April','May','June',
            'July','August','September','October','November','December'][new Date().getMonth()];
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── Card Grid ───────────────────────────────────────────────────────────────

function build_cards(items, card_class) {
    if (!items || !items.length)
        return `<div class="text-muted" style="padding:20px;width:100%;text-align:center;">No employees available for the selected period.</div>`;

    return items.map(item => `
        <label style="display:flex;flex-direction:column;align-items:flex-start;
            width:calc(33.33% - 8px);min-width:140px;
            border:1px solid var(--border-color,#d1d8dd);
            border-radius:6px;padding:10px 12px;cursor:pointer;
            background:var(--card-bg,#fff);
            transition:border-color 0.15s,box-shadow 0.15s;box-sizing:border-box;gap:4px;"
            onmouseover="this.style.borderColor='var(--primary,#5e64ff)';this.style.boxShadow='0 0 0 2px var(--primary-light,#eef0ff)'"
            onmouseout="this.style.borderColor='var(--border-color,#d1d8dd)';this.style.boxShadow='none'">
            <div style="display:flex;align-items:center;gap:8px;width:100%;">
                <input type="checkbox" class="${card_class}"
                    data-id="${frappe.utils.escape_html(item.id)}"
                    data-name="${frappe.utils.escape_html(item.name)}"
                    style="cursor:pointer;margin:0;flex-shrink:0;">
                <span style="font-weight:600;font-size:12px;color:var(--text-color,#1f272e);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
                    ${frappe.utils.escape_html(item.name)}
                </span>
            </div>
            <span style="font-size:11px;color:var(--text-muted,#8d99a6);padding-left:22px;">
                ${frappe.utils.escape_html(item.id)}
            </span>
        </label>`).join('');
}

function render_card_grid(dialog, html_field, card_class, count_id, search_id, items) {
    dialog._card_items = dialog._card_items || {};
    dialog._card_items[html_field] = items;

    const wrapper = dialog.fields_dict[html_field].$wrapper;
    wrapper.html(`
        <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="${search_id}" type="text" class="form-control"
                placeholder="Search by name or Employee ID..."
                style="flex:1;min-width:160px;max-width:320px;">
            <button class="btn btn-xs btn-default" id="${search_id}_select_all">${__('Select All')}</button>
            <button class="btn btn-xs btn-default" id="${search_id}_deselect_all">${__('Deselect All')}</button>
            <span id="${count_id}" class="text-muted" style="font-size:12px;">0 selected</span>
        </div>
        <div id="${search_id}_grid"
            style="display:flex;flex-wrap:wrap;gap:10px;max-height:380px;overflow-y:auto;padding:4px 2px;">
            ${build_cards(items, card_class)}
        </div>`);

    const update = () => update_count(wrapper, card_class, count_id);
    const bind   = () => {
        wrapper.find(`.${card_class}`).off('change').on('change', update);
        update();
    };

    wrapper.find(`#${search_id}`).on('input', function() {
        const q = $(this).val().toLowerCase().trim();
        const filtered = q
            ? dialog._card_items[html_field].filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
            : dialog._card_items[html_field];
        wrapper.find(`#${search_id}_grid`).html(build_cards(filtered, card_class));
        bind();
    });

    wrapper.find(`#${search_id}_select_all`).on('click', () => {
        wrapper.find(`.${card_class}`).prop('checked', true); update();
    });
    wrapper.find(`#${search_id}_deselect_all`).on('click', () => {
        wrapper.find(`.${card_class}`).prop('checked', false); update();
    });

    bind();
}

function update_count(wrapper, card_class, count_id) {
    wrapper.find(`#${count_id}`).text(wrapper.find(`.${card_class}:checked`).length + ' selected');
}

function get_checked_ids(dialog, html_field, card_class) {
    const ids = [];
    dialog.fields_dict[html_field].$wrapper.find(`.${card_class}:checked`).each(function() {
        ids.push({ id: $(this).data('id'), name: $(this).data('name') });
    });
    return ids;
}

// ─── Dialog Field Definitions ─────────────────────────────────────────────────

function base_fields(fetch_label, fetch_fn, html_field) {
    return [
        { fieldname: 'company', fieldtype: 'Link', label: 'Company', options: 'Company', reqd: 1 },
        { fieldname: 'cb1', fieldtype: 'Column Break' },
        { fieldname: 'year', fieldtype: 'Select', label: 'Year', options: get_year_options(), reqd: 1, default: new Date().getFullYear().toString() },
        { fieldname: 'cb2', fieldtype: 'Column Break' },
        { fieldname: 'month', fieldtype: 'Select', label: 'Month', options: MONTHS, reqd: 1, default: get_current_month() },
        { fieldname: 'sb1', fieldtype: 'Section Break' },
        { fieldname: 'fetch_btn', fieldtype: 'Button', label: fetch_label, click: function() { fetch_fn(this._dialog); } },
        { fieldname: 'sb2', fieldtype: 'Section Break' },
        { fieldname: html_field, fieldtype: 'HTML' }
    ];
}

// ─── Bulk Generate ────────────────────────────────────────────────────────────

function show_bulk_salary_slip_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Bulk Generate Salary Slips'),
        fields: [
            { fieldname: 'company', fieldtype: 'Link', label: 'Company', options: 'Company', reqd: 1 },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            { fieldname: 'year', fieldtype: 'Select', label: 'Year', options: get_year_options(), reqd: 1, default: new Date().getFullYear().toString() },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            { fieldname: 'month', fieldtype: 'Select', label: 'Month', options: MONTHS, reqd: 1, default: get_current_month() },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            { fieldname: 'fetch_employees', fieldtype: 'Button', label: 'Fetch Eligible Employees', click: function() { fetch_eligible_employees(d); } },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'employees_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Generate Salary Slips'),
        primary_action: () => generate_bulk_salary_slips(d)
    });
    d.show();
}

function fetch_eligible_employees(dialog) {
    const company = dialog.get_value('company');
    const year    = dialog.get_value('year');
    const month   = dialog.get_value('month');

    if (!company)        { frappe.msgprint(__('Please select Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    const wrapper = dialog.fields_dict.employees_html.$wrapper;
    wrapper.html(`<div class="text-muted" style="padding:16px 0;text-align:center;font-size:12px;">
        ${frappe.utils.icon('loading','xs')} &nbsp;Retrieving employee payroll eligibility...
    </div>`);

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_eligible_employees_for_salary_slip',
        args: { company, year, month },
        callback: function(r) {
            if (!r.message) {
                wrapper.html('<div class="text-muted" style="padding:16px 0;text-align:center;">Unable to retrieve employee data. Please try again.</div>');
                return;
            }

            const { eligible, skipped, total_active, total_eligible } = r.message;
            const ineligible_list = skipped || [];

            dialog._card_items = dialog._card_items || {};
            dialog._card_items['employees_html'] = (eligible || []).map(emp => ({
                id:   emp.name,
                name: emp.employee_name || emp.name
            }));
            dialog._ineligible_employees = ineligible_list;

            const ineligible_btn = ineligible_list.length > 0
                ? `<button class="btn btn-default btn-sm" id="btn_view_ineligible"
                        style="margin-left:auto;">
                        ${__('View Ineligibility Details')} (${ineligible_list.length})
                   </button>`
                : '';

            const summary = `
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:16px;
                    padding:8px 0;margin-bottom:12px;font-size:12px;
                    border-bottom:1px solid var(--border-color);">
                    <span style="color:var(--text-muted);">
                        Active Employees: <strong style="color:var(--text-color);">${total_active}</strong>
                    </span>
                    <span style="color:var(--border-color);">|</span>
                    <span style="color:var(--text-muted);">
                        Eligible for Processing: <strong style="color:var(--text-color);">${total_eligible}</strong>
                    </span>
                    <span style="color:var(--border-color);">|</span>
                    <span style="color:var(--text-muted);">
                        Excluded: <strong style="color:var(--text-color);">${ineligible_list.length}</strong>
                    </span>
                    ${ineligible_btn}
                </div>`;

            let grid_html = '';
            if (eligible && eligible.length > 0) {
                grid_html = `
                    <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input id="emp_search" type="text" class="form-control"
                            placeholder="Search by name or Employee ID..."
                            style="flex:1;min-width:160px;max-width:300px;font-size:12px;">
                        <button class="btn btn-xs btn-default" id="emp_search_select_all">${__('Select All')}</button>
                        <button class="btn btn-xs btn-default" id="emp_search_deselect_all">${__('Deselect All')}</button>
                        <span id="emp_selected_count" class="text-muted" style="font-size:12px;">0 selected</span>
                    </div>
                    <div id="emp_search_grid"
                        style="display:flex;flex-wrap:wrap;gap:10px;max-height:300px;overflow-y:auto;padding:4px 2px;">
                        ${build_cards(dialog._card_items['employees_html'], 'emp-card-check')}
                    </div>`;
            } else {
                grid_html = `<div class="text-muted" style="padding:20px 0;text-align:center;font-size:12px;">
                    No employees are eligible for payroll processing in the selected period.</div>`;
            }

            wrapper.html(summary + grid_html);

            if (ineligible_list.length > 0) {
                wrapper.find('#btn_view_ineligible').on('click', () =>
                    show_ineligible_employees_dialog(dialog._ineligible_employees, month, year));
            }

            if (eligible && eligible.length > 0) {
                const update = () => update_count(wrapper, 'emp-card-check', 'emp_selected_count');
                const bind   = () => { wrapper.find('.emp-card-check').off('change').on('change', update); update(); };

                wrapper.find('#emp_search').on('input', function() {
                    const q = $(this).val().toLowerCase().trim();
                    const all = dialog._card_items['employees_html'];
                    const filtered = q ? all.filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : all;
                    wrapper.find('#emp_search_grid').html(build_cards(filtered, 'emp-card-check'));
                    bind();
                });

                wrapper.find('#emp_search_select_all').on('click', () => {
                    wrapper.find('.emp-card-check').prop('checked', true); update();
                });
                wrapper.find('#emp_search_deselect_all').on('click', () => {
                    wrapper.find('.emp-card-check').prop('checked', false); update();
                });

                bind();
            }
        }
    });
}

// ─── Ineligible Employees Dialog ──────────────────────────────────────────────

function show_ineligible_employees_dialog(ineligible_list, month, year) {
    function parse_reasons(reasons) {
        const f = { no_salary_structure: false, no_variable_pay: false, slip_exists: false, no_attendance: false };
        (reasons || []).forEach(r => {
            const l = r.toLowerCase();
            if (l.includes('salary structure'))                                     f.no_salary_structure = true;
            if (l.includes('variable pay'))                                         f.no_variable_pay     = true;
            if (l.includes('already exists') || l.includes('salary slip already')) f.slip_exists         = true;
            if (l.includes('attendance'))                                           f.no_attendance       = true;
        });
        return f;
    }

    const ICON_FAIL = `<span style="display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;border-radius:50%;
        background:var(--red-100,#fde8e8);color:var(--red-500,#e03131);
        font-size:13px;font-weight:700;">✕</span>`;

    const ICON_OK = `<span style="display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;border-radius:50%;
        background:var(--green-100,#ebfbee);color:var(--green-600,#2f9e44);
        font-size:13px;font-weight:700;">✓</span>`;

    const rows = ineligible_list.map((s, idx) => {
        const f  = parse_reasons(s.reasons || []);
        const bg = idx % 2 !== 0 ? 'background:var(--subtle-accent-bg,#f9fafb);' : '';
        return `<tr style="${bg}">
            <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);vertical-align:middle;white-space:nowrap;">
                <div style="font-size:12px;font-weight:600;color:var(--text-color);">${frappe.utils.escape_html(s.name)}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${frappe.utils.escape_html(s.id)}</div>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_salary_structure ? ICON_FAIL : ICON_OK}</td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_variable_pay     ? ICON_FAIL : ICON_OK}</td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.slip_exists         ? ICON_FAIL : ICON_OK}</td>
            <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_attendance       ? ICON_FAIL : ICON_OK}</td>
        </tr>`;
    }).join('');

    const th = (label, last) => `<th style="
        position:sticky;top:0;z-index:1;
        padding:8px 10px;text-align:center;font-size:11px;font-weight:600;
        text-transform:uppercase;letter-spacing:0.04em;
        color:var(--text-muted);background:var(--subtle-accent-bg,#f5f6f7);
        border-bottom:2px solid var(--border-color);
        ${last ? '' : 'border-right:1px solid var(--border-color);'}
        white-space:normal;line-height:1.4;">${label}</th>`;

    const legend = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;font-size:11px;color:var(--text-muted);">
            <span style="display:flex;align-items:center;gap:5px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;
                    background:var(--red-100,#fde8e8);color:var(--red-500,#e03131);font-size:11px;font-weight:700;">✕</span>
                Criterion not met
            </span>
            <span style="display:flex;align-items:center;gap:5px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;
                    background:var(--green-100,#ebfbee);color:var(--green-600,#2f9e44);font-size:11px;font-weight:700;">✓</span>
                Criterion met
            </span>
        </div>`;

    const content = `
        <p style="margin-bottom:12px;font-size:12px;color:var(--text-color);">
            <strong>${ineligible_list.length}</strong> employee(s) have been excluded from payroll processing for
            <strong>${month} ${year}</strong> as they do not meet one or more eligibility criteria.
        </p>
        ${legend}
        <div style="margin-bottom:10px;">
            <input id="ineligible_search" type="text" class="form-control"
                placeholder="Search by name or Employee ID..."
                style="max-width:320px;font-size:12px;">
        </div>
        <div style="border:1px solid var(--border-color);border-radius:var(--border-radius);overflow:hidden;">
            <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
                <table id="ineligible_table" style="width:100%;border-collapse:collapse;min-width:560px;">
                    <thead>
                        <tr>
                            <th style="position:sticky;top:0;z-index:1;padding:8px 10px;text-align:left;
                                font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;
                                color:var(--text-muted);background:var(--subtle-accent-bg,#f5f6f7);
                                border-bottom:2px solid var(--border-color);border-right:1px solid var(--border-color);
                                width:28%;">Employee</th>
                            ${th('Salary Structure<br>Assigned', false)}
                            ${th('Variable Pay<br>Configured', false)}
                            ${th('No Duplicate<br>Salary Slip', false)}
                            ${th('Attendance<br>Recorded', true)}
                        </tr>
                    </thead>
                    <tbody id="ineligible_tbody">${rows}</tbody>
                </table>
            </div>
        </div>`;

    let ineligible_dialog = new frappe.ui.Dialog({
        title: __('Payroll Eligibility Review — ' + month + ' ' + year),
        size: 'large',
        fields: [{ fieldname: 'ineligible_html', fieldtype: 'HTML' }]
    });

    ineligible_dialog.fields_dict.ineligible_html.$wrapper.html(
        `<div style="padding-bottom:4px;">${content}</div>`
    );
    ineligible_dialog.show();

    ineligible_dialog.fields_dict.ineligible_html.$wrapper.find('#ineligible_search').on('input', function() {
        const q      = $(this).val().toLowerCase().trim();
        const tbody  = ineligible_dialog.fields_dict.ineligible_html.$wrapper.find('#ineligible_tbody');
        const source = q ? ineligible_list.filter(s => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : ineligible_list;

        tbody.html(source.map((s, idx) => {
            const f  = parse_reasons(s.reasons || []);
            const bg = idx % 2 !== 0 ? 'background:var(--subtle-accent-bg,#f9fafb);' : '';
            return `<tr style="${bg}">
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);vertical-align:middle;white-space:nowrap;">
                    <div style="font-size:12px;font-weight:600;color:var(--text-color);">${frappe.utils.escape_html(s.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${frappe.utils.escape_html(s.id)}</div>
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_salary_structure ? ICON_FAIL : ICON_OK}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_variable_pay     ? ICON_FAIL : ICON_OK}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);border-right:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.slip_exists         ? ICON_FAIL : ICON_OK}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;vertical-align:middle;">${f.no_attendance       ? ICON_FAIL : ICON_OK}</td>
            </tr>`;
        }).join('') || `<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center;">No matching employees found.</td></tr>`);
    });
}

function generate_bulk_salary_slips(dialog) {
    const company  = dialog.get_value('company');
    const year     = dialog.get_value('year');
    const month    = dialog.get_value('month');
    const selected = get_checked_ids(dialog, 'employees_html', 'emp-card-check');

    if (!selected.length) { frappe.msgprint(__('Please select at least one employee to proceed')); return; }

    frappe.confirm(`Are you sure you want to generate salary slips for <b>${selected.length}</b> employee(s)?`, function() {
        dialog.hide();
        frappe.dom.freeze(__('Generating Salary Slips... Please wait...'));

        frappe.call({
            method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_generate_salary_slips',
            args: { employees: selected.map(s => ({ employee: s.id, employee_name: s.name })), year, month },
            callback: function(r) {
                frappe.dom.unfreeze();
                if (r.message) { show_result_dialog(__('Bulk Generation Result'), r.message, 'Successfully Created'); cur_list.refresh(); }
            },
            error: function() {
                frappe.dom.unfreeze();
                frappe.msgprint({ title: __('Error'), message: __('Failed to generate salary slips. Please try again or contact your system administrator.'), indicator: 'red' });
            }
        });
    });
}

// ─── Bulk Print ───────────────────────────────────────────────────────────────

function show_bulk_print_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Bulk Print Salary Slips'),
        fields: [
            { fieldname: 'company', fieldtype: 'Link', label: 'Company', options: 'Company', reqd: 1 },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            { fieldname: 'year', fieldtype: 'Select', label: 'Year', options: get_year_options(), reqd: 1, default: new Date().getFullYear().toString() },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            { fieldname: 'month', fieldtype: 'Select', label: 'Month', options: MONTHS, reqd: 1, default: get_current_month() },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            { fieldname: 'fetch_slips', fieldtype: 'Button', label: 'Fetch Submitted Salary Slips', click: function() { fetch_submitted_salary_slips(d); } },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'slips_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Print Selected Slips'),
        primary_action: () => print_selected_salary_slips(d)
    });
    d.show();
}

function fetch_submitted_salary_slips(dialog) {
    const company = dialog.get_value('company');
    const year    = dialog.get_value('year');
    const month   = dialog.get_value('month');

    if (!company)        { frappe.msgprint(__('Please select Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    const wrapper = dialog.fields_dict.slips_html.$wrapper;
    wrapper.html(`<div class="text-muted" style="padding:16px 0;text-align:center;font-size:12px;">
        ${frappe.utils.icon('loading','xs')} &nbsp;Retrieving submitted salary slips...
    </div>`);

    let active_count = null;
    let slips_data   = null;
    let pending      = 2;

    function render() {
        if (--pending > 0) return;

        const submitted_count = slips_data ? slips_data.length : 0;

        const summary = `
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:16px;
                padding:8px 0;margin-bottom:12px;font-size:12px;
                border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">
                    Active Employees: <strong style="color:var(--text-color);">${active_count !== null ? active_count : '-'}</strong>
                </span>
                <span style="color:var(--border-color);">|</span>
                <span style="color:var(--text-muted);">
                    Submitted Salary Slips: <strong style="color:var(--text-color);">${submitted_count}</strong>
                </span>
            </div>`;

        if (slips_data && slips_data.length) {
            const items = slips_data.map(s => ({ id: s.name, name: s.employee_name || s.employee }));
            dialog._card_items = dialog._card_items || {};
            dialog._card_items['slips_html'] = items;

            wrapper.html(summary + `
                <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input id="slip_search" type="text" class="form-control"
                        placeholder="Search by name or Employee ID..."
                        style="flex:1;min-width:160px;max-width:320px;">
                    <button class="btn btn-xs btn-default" id="slip_search_select_all">${__('Select All')}</button>
                    <button class="btn btn-xs btn-default" id="slip_search_deselect_all">${__('Deselect All')}</button>
                    <span id="slip_selected_count" class="text-muted" style="font-size:12px;">0 selected</span>
                </div>
                <div id="slip_search_grid"
                    style="display:flex;flex-wrap:wrap;gap:10px;max-height:380px;overflow-y:auto;padding:4px 2px;">
                    ${build_cards(items, 'slip-card-check')}
                </div>`);

            const update = () => update_count(wrapper, 'slip-card-check', 'slip_selected_count');
            const bind   = () => { wrapper.find('.slip-card-check').off('change').on('change', update); update(); };

            wrapper.find('#slip_search').on('input', function() {
                const q = $(this).val().toLowerCase().trim();
                const filtered = q ? items.filter(i => i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : items;
                wrapper.find('#slip_search_grid').html(build_cards(filtered, 'slip-card-check'));
                bind();
            });
            wrapper.find('#slip_search_select_all').on('click', () => { wrapper.find('.slip-card-check').prop('checked', true); update(); });
            wrapper.find('#slip_search_deselect_all').on('click', () => { wrapper.find('.slip-card-check').prop('checked', false); update(); });
            bind();
        } else {
            wrapper.html(summary + `<div class="text-muted" style="padding:20px;text-align:center;">No submitted salary slips found for the selected payroll period.</div>`);
        }
    }

    frappe.call({
        method: 'frappe.client.get_count',
        args: { doctype: 'Company Link', filters: { is_active: 1, company } },
        callback: function(r) { active_count = r.message || 0; render(); },
        error:    function()  { active_count = 0; render(); }
    });

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_submitted_salary_slips',
        args: { company, year, month },
        callback: function(r) { slips_data = r.message || []; render(); },
        error:    function()  { slips_data = []; render(); }
    });
}

function print_selected_salary_slips(dialog) {
    const selected = get_checked_ids(dialog, 'slips_html', 'slip-card-check');
    if (!selected.length) { frappe.msgprint(__('Please select at least one salary slip to print')); return; }

    frappe.confirm(`Are you sure you want to print <b>${selected.length}</b> salary slip(s)?`, function() {
        dialog.hide();
        frappe.dom.freeze(__('Preparing PDF for printing... Please wait...'));

        frappe.call({
            method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_print_salary_slips',
            args: { salary_slip_names: selected.map(s => s.id) },
            callback: function(r) {
                frappe.dom.unfreeze();
                if (r.message) {
                    window.open(r.message.pdf_url, '_blank');
                    frappe.msgprint({ title: __('Print Ready'), message: `${selected.length} salary slip(s) have been prepared for printing.`, indicator: 'green' });
                }
            },
            error: function() {
                frappe.dom.unfreeze();
                frappe.msgprint({ title: __('Error'), message: __('Failed to generate PDF. Please try again or contact your system administrator.'), indicator: 'red' });
            }
        });
    });
}

// ─── Draft to Submit ──────────────────────────────────────────────────────────

function show_draft_to_submit_dialog() {
    let d = new frappe.ui.Dialog({
        title: __('Submit Draft Salary Slips'),
        fields: [
            { fieldname: 'company', fieldtype: 'Link', label: 'Company', options: 'Company', reqd: 1 },
            { fieldname: 'cb1', fieldtype: 'Column Break' },
            { fieldname: 'year', fieldtype: 'Select', label: 'Year', options: get_year_options(), reqd: 1, default: new Date().getFullYear().toString() },
            { fieldname: 'cb2', fieldtype: 'Column Break' },
            { fieldname: 'month', fieldtype: 'Select', label: 'Month', options: MONTHS, reqd: 1, default: get_current_month() },
            { fieldname: 'sb1', fieldtype: 'Section Break' },
            { fieldname: 'fetch_drafts', fieldtype: 'Button', label: 'Fetch Draft Salary Slips', click: function() { fetch_draft_salary_slips(d); } },
            { fieldname: 'sb2', fieldtype: 'Section Break' },
            { fieldname: 'drafts_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Submit Selected Slips'),
        primary_action: () => submit_selected_salary_slips(d)
    });
    d.show();
}

function fetch_draft_salary_slips(dialog) {
    const company = dialog.get_value('company');
    const year    = dialog.get_value('year');
    const month   = dialog.get_value('month');

    if (!company)        { frappe.msgprint(__('Please select Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_draft_salary_slips',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length) {
                render_card_grid(dialog, 'drafts_html', 'draft-card-check', 'draft_selected_count', 'draft_search',
                    r.message.map(s => ({ id: s.name, name: s.employee_name || s.employee })));
            } else {
                dialog.fields_dict.drafts_html.$wrapper.html(
                    '<div class="text-muted" style="padding:20px;text-align:center;">No draft salary slips found for the selected payroll period.</div>');
            }
        }
    });
}

function submit_selected_salary_slips(dialog) {
    const selected = get_checked_ids(dialog, 'drafts_html', 'draft-card-check');
    if (!selected.length) { frappe.msgprint(__('Please select at least one salary slip to submit')); return; }

    frappe.confirm(`Are you sure you want to submit <b>${selected.length}</b> salary slip(s)? This action cannot be undone.`, function() {
        dialog.hide();
        frappe.dom.freeze(__('Submitting salary slips... Please wait...'));

        frappe.call({
            method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_submit_salary_slips',
            args: { salary_slip_names: selected.map(s => s.id) },
            callback: function(r) {
                frappe.dom.unfreeze();
                if (r.message) { show_result_dialog(__('Bulk Submission Result'), r.message, 'Successfully Submitted'); cur_list.refresh(); }
            },
            error: function() {
                frappe.dom.unfreeze();
                frappe.msgprint({ title: __('Error'), message: __('Failed to submit salary slips. Please try again or contact your system administrator.'), indicator: 'red' });
            }
        });
    });
}

// ─── Result Dialog ────────────────────────────────────────────────────────────

function show_result_dialog(title, result, success_label) {
    let msg = `
        <table class="table table-bordered" style="margin-bottom:0;">
            <tr><td><strong>${success_label}:</strong></td>
                <td style="color:var(--green);font-weight:bold;">${result.success}</td></tr>
            <tr><td><strong>Failed:</strong></td>
                <td style="color:var(--red);font-weight:bold;">${result.failed}</td></tr>
        </table>`;

    if (result.errors && result.errors.length) {
        msg += '<div style="margin-top:12px;"><strong>Details:</strong><ul style="margin-top:4px;">';
        result.errors.forEach(e => { msg += `<li>${e}</li>`; });
        msg += '</ul></div>';
    }

    frappe.msgprint({ title, message: msg, indicator: result.failed > 0 ? 'orange' : 'green' });
}