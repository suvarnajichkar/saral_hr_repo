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

// ─── Shared Styles ────────────────────────────────────────────────────────────

const BULK_DIALOG_STYLES = `
<style>
.bulk-salary-dialog .modal-dialog {
    max-width: 900px !important;
    width: 90vw !important;
}
.bulk-salary-dialog .modal-body {
    padding: 20px 24px !important;
    max-height: 80vh !important;
    overflow-y: auto !important;
}

/* Search Bar */
.bulk-search-bar {
    position: relative;
    margin-bottom: 12px;
}
.bulk-search-bar input {
    width: 100%;
    padding: 8px 12px 8px 36px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-size: 13px;
    background: var(--control-bg);
    color: var(--text-color);
    outline: none;
    transition: border-color 0.15s;
}
.bulk-search-bar input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-light);
}
.bulk-search-bar .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 13px;
    pointer-events: none;
}

/* Toolbar above table */
.bulk-table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--control-bg);
    border: 1px solid var(--border-color);
    border-bottom: none;
    border-radius: var(--border-radius) var(--border-radius) 0 0;
    font-size: 12px;
    gap: 10px;
}
.bulk-table-toolbar .toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
}
.bulk-table-toolbar .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
}
.bulk-select-all-btn {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: var(--border-radius);
    border: 1px solid var(--primary);
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
}
.bulk-select-all-btn:hover {
    background: var(--primary);
    color: #fff;
}
.bulk-deselect-all-btn {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
}
.bulk-deselect-all-btn:hover {
    background: var(--bg-color);
    color: var(--text-color);
}

/* Table wrapper */
.bulk-table-wrapper {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 0 0 var(--border-radius) var(--border-radius);
}
.bulk-table-wrapper table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.bulk-table-wrapper thead th {
    position: sticky;
    top: 0;
    background: var(--fg-color);
    z-index: 2;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 2px solid var(--border-color);
    white-space: nowrap;
}
.bulk-table-wrapper tbody tr {
    border-bottom: 1px solid var(--border-color);
    transition: background 0.1s;
}
.bulk-table-wrapper tbody tr:last-child {
    border-bottom: none;
}
.bulk-table-wrapper tbody tr:hover {
    background: var(--control-bg-on-gray);
}
.bulk-table-wrapper tbody tr.row-selected {
    background: var(--primary-light) !important;
}
.bulk-table-wrapper tbody td {
    padding: 9px 12px;
    vertical-align: middle;
    color: var(--text-color);
}
.bulk-table-wrapper tbody td.cell-checkbox {
    width: 44px;
    text-align: center;
    padding: 9px 8px;
}
.bulk-table-wrapper input[type="checkbox"] {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--primary);
}
.bulk-table-wrapper .cell-id {
    font-family: monospace;
    font-size: 12px;
    color: var(--text-muted);
}
.bulk-table-wrapper .cell-name {
    font-weight: 500;
}
.bulk-table-wrapper .cell-currency {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
}
.bulk-table-wrapper .badge-dept {
    display: inline-block;
    background: var(--bg-blue);
    color: var(--text-on-blue);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 20px;
}
.bulk-table-wrapper .no-records {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 13px;
}
.bulk-table-wrapper .no-records svg {
    display: block;
    margin: 0 auto 10px;
    opacity: 0.3;
}

/* Footer bar */
.bulk-footer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding: 8px 12px;
    background: var(--control-bg);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-size: 12px;
    color: var(--text-muted);
}
.bulk-footer-bar .count-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--primary);
    font-size: 13px;
}
.bulk-footer-bar .total-info {
    font-size: 12px;
    color: var(--text-muted);
}
.hidden-row {
    display: none !important;
}
</style>
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inject_styles() {
    if (!document.getElementById('bulk-salary-dialog-styles')) {
        const el = document.createElement('div');
        el.id = 'bulk-salary-dialog-styles';
        el.innerHTML = BULK_DIALOG_STYLES;
        document.head.appendChild(el.firstElementChild);
    }
}

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

function make_dialog_wide(dialog) {
    // Apply wide class to the modal
    $(dialog.$wrapper).addClass('bulk-salary-dialog');
}

// Render "empty state" inside a wrapper
function render_empty_state(wrapper, message) {
    wrapper.html(`
        <div class="bulk-table-wrapper">
            <div class="no-records">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                ${message}
            </div>
        </div>
    `);
}

// ─── Dialog: Bulk Generate ────────────────────────────────────────────────────

function show_bulk_salary_slip_dialog() {
    inject_styles();

    let d = new frappe.ui.Dialog({
        title: __('Bulk Generate Salary Slips'),
        size: 'large',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: __('Company'),
                options: 'Company',
                reqd: 1,
                onchange: function() { clear_employee_table(d); }
            },
            { fieldname: 'col1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: __('Year'),
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString(),
                onchange: function() { clear_employee_table(d); }
            },
            { fieldname: 'col2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: __('Month'),
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month(),
                onchange: function() { clear_employee_table(d); }
            },
            { fieldname: 'sec1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_employees',
                fieldtype: 'Button',
                label: __('Fetch Eligible Employees'),
                click: function() { fetch_eligible_employees(d); }
            },
            { fieldname: 'sec2', fieldtype: 'Section Break', label: '' },
            { fieldname: 'employees_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Generate Salary Slips'),
        primary_action: function() { generate_bulk_salary_slips(d); }
    });

    d.show();
    make_dialog_wide(d);
}

function clear_employee_table(dialog) {
    if (dialog.fields_dict.employees_html) {
        dialog.fields_dict.employees_html.$wrapper.html('');
    }
}

function fetch_eligible_employees(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company) { frappe.msgprint(__('Please select a Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    dialog.fields_dict.employees_html.$wrapper.html(
        `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            <div class="loading-text">${frappe.utils.icon('loading', 'sm')} Fetching employees…</div>
        </div>`
    );

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_eligible_employees_for_salary_slip',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                render_employees_table(dialog, r.message);
            } else {
                render_empty_state(
                    dialog.fields_dict.employees_html.$wrapper,
                    'No eligible employees found for the selected period.'
                );
            }
        }
    });
}

function render_employees_table(dialog, employees) {
    const wrapper = dialog.fields_dict.employees_html.$wrapper;

    let rows_html = employees.map((emp, idx) => `
        <tr data-idx="${idx}" data-search="${(emp.employee_name + ' ' + emp.name + ' ' + (emp.department||'')).toLowerCase()}">
            <td class="cell-checkbox">
                <input type="checkbox" class="employee-checkbox"
                    data-employee="${emp.name}"
                    data-employee-name="${emp.employee_name || ''}">
            </td>
            <td class="cell-id">${emp.name}</td>
            <td class="cell-name">${emp.employee_name || ''}</td>
            <td><span class="badge-dept">${emp.department || '–'}</span></td>
            <td>${emp.designation || '–'}</td>
        </tr>
    `).join('');

    wrapper.html(`
        <div class="bulk-search-bar">
            <span class="search-icon">${frappe.utils.icon('search', 'xs')}</span>
            <input type="text" class="emp-search-input" placeholder="${__('Search by name, ID or department…')}">
        </div>
        <div class="bulk-table-toolbar">
            <div class="toolbar-left">
                <button class="bulk-select-all-btn">${__('Select All')}</button>
                <button class="bulk-deselect-all-btn">${__('Deselect All')}</button>
            </div>
            <div class="toolbar-right">
                <span class="result-count" style="font-size:12px;color:var(--text-muted);">
                    ${employees.length} employee(s) found
                </span>
            </div>
        </div>
        <div class="bulk-table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width:44px;"></th>
                        <th>${__('Employee ID')}</th>
                        <th>${__('Name')}</th>
                        <th>${__('Department')}</th>
                        <th>${__('Designation')}</th>
                    </tr>
                </thead>
                <tbody>${rows_html}</tbody>
            </table>
        </div>
        <div class="bulk-footer-bar">
            <span class="count-badge">
                ${frappe.utils.icon('check', 'xs')}
                <span class="selected-count-text">0 selected</span>
            </span>
            <span class="total-info">${employees.length} total</span>
        </div>
    `);

    bind_table_events(wrapper, '.employee-checkbox', '.selected-count-text', 'employee(s)');

    // Search
    wrapper.find('.emp-search-input').on('input', function() {
        let q = $(this).val().toLowerCase().trim();
        let visible = 0;
        wrapper.find('tbody tr').each(function() {
            let match = !q || $(this).data('search').includes(q);
            $(this).toggleClass('hidden-row', !match);
            if (match) visible++;
        });
        wrapper.find('.result-count').text(visible + ' employee(s) found');
        update_count(wrapper, '.employee-checkbox', '.selected-count-text', 'employee(s)');
    });

    // Select / Deselect all
    wrapper.find('.bulk-select-all-btn').on('click', function() {
        wrapper.find('.employee-checkbox:not(.hidden-row)').each(function() {
            // Only check visible rows
            let $tr = $(this).closest('tr');
            if (!$tr.hasClass('hidden-row')) $(this).prop('checked', true);
        });
        wrapper.find('tbody tr:not(.hidden-row) .employee-checkbox').prop('checked', true).closest('tr').addClass('row-selected');
        update_count(wrapper, '.employee-checkbox', '.selected-count-text', 'employee(s)');
    });
    wrapper.find('.bulk-deselect-all-btn').on('click', function() {
        wrapper.find('.employee-checkbox').prop('checked', false).closest('tr').removeClass('row-selected');
        update_count(wrapper, '.employee-checkbox', '.selected-count-text', 'employee(s)');
    });
}

// ─── Dialog: Bulk Print ───────────────────────────────────────────────────────

function show_bulk_print_dialog() {
    inject_styles();

    let d = new frappe.ui.Dialog({
        title: __('Bulk Print Salary Slips'),
        size: 'large',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: __('Company'),
                options: 'Company',
                reqd: 1,
                onchange: function() { clear_slips_table(d); }
            },
            { fieldname: 'col1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: __('Year'),
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString(),
                onchange: function() { clear_slips_table(d); }
            },
            { fieldname: 'col2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: __('Month'),
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month(),
                onchange: function() { clear_slips_table(d); }
            },
            { fieldname: 'sec1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_slips',
                fieldtype: 'Button',
                label: __('Fetch Submitted Slips'),
                click: function() { fetch_submitted_salary_slips(d); }
            },
            { fieldname: 'sec2', fieldtype: 'Section Break', label: '' },
            { fieldname: 'slips_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Print Selected Slips'),
        primary_action: function() { print_selected_salary_slips(d); }
    });

    d.show();
    make_dialog_wide(d);
}

function clear_slips_table(dialog) {
    if (dialog.fields_dict.slips_html) {
        dialog.fields_dict.slips_html.$wrapper.html('');
    }
}

function fetch_submitted_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company) { frappe.msgprint(__('Please select a Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    dialog.fields_dict.slips_html.$wrapper.html(
        `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            ${frappe.utils.icon('loading', 'sm')} Fetching submitted salary slips…
        </div>`
    );

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_submitted_salary_slips',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                render_slips_table(dialog, r.message, 'slips_html', 'slip-checkbox', 'selected-slips-count-text', 'slip(s)');
            } else {
                render_empty_state(
                    dialog.fields_dict.slips_html.$wrapper,
                    'No submitted salary slips found for the selected period.'
                );
            }
        }
    });
}

// ─── Dialog: Draft to Submit ──────────────────────────────────────────────────

function show_draft_to_submit_dialog() {
    inject_styles();

    let d = new frappe.ui.Dialog({
        title: __('Submit Draft Salary Slips'),
        size: 'large',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: __('Company'),
                options: 'Company',
                reqd: 1,
                onchange: function() { clear_drafts_table(d); }
            },
            { fieldname: 'col1', fieldtype: 'Column Break' },
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: __('Year'),
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString(),
                onchange: function() { clear_drafts_table(d); }
            },
            { fieldname: 'col2', fieldtype: 'Column Break' },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: __('Month'),
                options: ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'],
                reqd: 1,
                default: get_current_month(),
                onchange: function() { clear_drafts_table(d); }
            },
            { fieldname: 'sec1', fieldtype: 'Section Break' },
            {
                fieldname: 'fetch_drafts',
                fieldtype: 'Button',
                label: __('Fetch Draft Slips'),
                click: function() { fetch_draft_salary_slips(d); }
            },
            { fieldname: 'sec2', fieldtype: 'Section Break', label: '' },
            { fieldname: 'drafts_html', fieldtype: 'HTML' }
        ],
        primary_action_label: __('Submit Selected Slips'),
        primary_action: function() { submit_selected_salary_slips(d); }
    });

    d.show();
    make_dialog_wide(d);
}

function clear_drafts_table(dialog) {
    if (dialog.fields_dict.drafts_html) {
        dialog.fields_dict.drafts_html.$wrapper.html('');
    }
}

function fetch_draft_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    if (!company) { frappe.msgprint(__('Please select a Company')); return; }
    if (!year || !month) { frappe.msgprint(__('Please select Year and Month')); return; }

    dialog.fields_dict.drafts_html.$wrapper.html(
        `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            ${frappe.utils.icon('loading', 'sm')} Fetching draft salary slips…
        </div>`
    );

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_draft_salary_slips',
        args: { company, year, month },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                render_slips_table(dialog, r.message, 'drafts_html', 'draft-checkbox', 'selected-drafts-count-text', 'draft(s)');
            } else {
                render_empty_state(
                    dialog.fields_dict.drafts_html.$wrapper,
                    'No draft salary slips found for the selected period.'
                );
            }
        }
    });
}

// ─── Shared: Salary Slips Table (used by both Print & Draft-to-Submit) ────────

function render_slips_table(dialog, slips, field_name, checkbox_class, count_text_class, label) {
    const wrapper = dialog.fields_dict[field_name].$wrapper;

    let total_net = slips.reduce((sum, s) => sum + (s.net_salary || 0), 0);

    let rows_html = slips.map((slip, idx) => `
        <tr data-idx="${idx}" data-search="${(slip.employee_name + ' ' + slip.employee + ' ' + (slip.department||'')).toLowerCase()}">
            <td class="cell-checkbox">
                <input type="checkbox" class="${checkbox_class}"
                    data-slip-name="${slip.name}"
                    data-employee-name="${slip.employee_name || ''}">
            </td>
            <td class="cell-id">${slip.name}</td>
            <td class="cell-id">${slip.employee}</td>
            <td class="cell-name">${slip.employee_name || ''}</td>
            <td><span class="badge-dept">${slip.department || '–'}</span></td>
            <td class="cell-currency">${format_currency(slip.net_salary, 'INR')}</td>
        </tr>
    `).join('');

    wrapper.html(`
        <div class="bulk-search-bar">
            <span class="search-icon">${frappe.utils.icon('search', 'xs')}</span>
            <input type="text" class="slip-search-input" placeholder="${__('Search by name, ID or department…')}">
        </div>
        <div class="bulk-table-toolbar">
            <div class="toolbar-left">
                <button class="bulk-select-all-btn">${__('Select All')}</button>
                <button class="bulk-deselect-all-btn">${__('Deselect All')}</button>
            </div>
            <div class="toolbar-right">
                <span class="result-count" style="font-size:12px;color:var(--text-muted);">
                    ${slips.length} ${label} found
                </span>
            </div>
        </div>
        <div class="bulk-table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width:44px;"></th>
                        <th>${__('Slip ID')}</th>
                        <th>${__('Employee ID')}</th>
                        <th>${__('Name')}</th>
                        <th>${__('Department')}</th>
                        <th style="text-align:right;">${__('Net Salary')}</th>
                    </tr>
                </thead>
                <tbody>${rows_html}</tbody>
            </table>
        </div>
        <div class="bulk-footer-bar">
            <span class="count-badge">
                ${frappe.utils.icon('check', 'xs')}
                <span class="${count_text_class}">0 selected</span>
            </span>
            <span class="total-info">Total Net: <strong>${format_currency(total_net, 'INR')}</strong></span>
        </div>
    `);

    bind_table_events(wrapper, '.' + checkbox_class, '.' + count_text_class, label);

    // Search
    wrapper.find('.slip-search-input').on('input', function() {
        let q = $(this).val().toLowerCase().trim();
        let visible = 0;
        wrapper.find('tbody tr').each(function() {
            let match = !q || $(this).data('search').includes(q);
            $(this).toggleClass('hidden-row', !match);
            if (match) visible++;
        });
        wrapper.find('.result-count').text(visible + ' ' + label + ' found');
        update_count(wrapper, '.' + checkbox_class, '.' + count_text_class, label);
    });

    // Select / Deselect all
    wrapper.find('.bulk-select-all-btn').on('click', function() {
        wrapper.find('tbody tr:not(.hidden-row) .' + checkbox_class).prop('checked', true).closest('tr').addClass('row-selected');
        update_count(wrapper, '.' + checkbox_class, '.' + count_text_class, label);
    });
    wrapper.find('.bulk-deselect-all-btn').on('click', function() {
        wrapper.find('.' + checkbox_class).prop('checked', false).closest('tr').removeClass('row-selected');
        update_count(wrapper, '.' + checkbox_class, '.' + count_text_class, label);
    });
}

// ─── Shared Event Binding ─────────────────────────────────────────────────────

function bind_table_events(wrapper, checkbox_selector, count_selector, label) {
    wrapper.find(checkbox_selector).on('change', function() {
        let $tr = $(this).closest('tr');
        $tr.toggleClass('row-selected', $(this).prop('checked'));
        update_count(wrapper, checkbox_selector, count_selector, label);
    });

    // Row click to toggle
    wrapper.find('tbody tr').on('click', function(e) {
        if ($(e.target).is('input[type="checkbox"]')) return;
        let $cb = $(this).find(checkbox_selector);
        $cb.prop('checked', !$cb.prop('checked')).trigger('change');
    });
}

function update_count(wrapper, checkbox_selector, count_selector, label) {
    let count = wrapper.find(checkbox_selector + ':checked').length;
    wrapper.find(count_selector).text(count + ' ' + label + ' selected');
}

// ─── Action: Generate ─────────────────────────────────────────────────────────

function generate_bulk_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year    = dialog.get_value('year');
    let month   = dialog.get_value('month');

    let selected_employees = [];
    dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox:checked').each(function() {
        selected_employees.push({
            employee: $(this).data('employee'),
            employee_name: $(this).data('employee-name')
        });
    });

    if (selected_employees.length === 0) {
        frappe.msgprint(__('Please select at least one employee'));
        return;
    }

    frappe.confirm(
        __('Generate salary slips for {0} employee(s) for {1} {2}?', [selected_employees.length, month, year]),
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Generating {0} salary slip(s)… Please wait.', [selected_employees.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_generate_salary_slips',
                args: { employees: selected_employees, year, month },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        show_result_dialog(__('Generation Complete'), r.message, 'Created');
                        cur_list.refresh();
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to generate salary slips. Please try again.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Action: Print ────────────────────────────────────────────────────────────

function print_selected_salary_slips(dialog) {
    let selected_slips = [];
    dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox:checked').each(function() {
        selected_slips.push($(this).data('slip-name'));
    });

    if (selected_slips.length === 0) {
        frappe.msgprint(__('Please select at least one salary slip'));
        return;
    }

    frappe.confirm(
        __('Generate a combined PDF for {0} salary slip(s)?', [selected_slips.length]),
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Generating PDF for {0} slip(s)… Please wait.', [selected_slips.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_print_salary_slips',
                args: { salary_slip_names: selected_slips },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        window.open(r.message.pdf_url, '_blank');
                        frappe.msgprint({
                            title: __('PDF Ready'),
                            message: __('Successfully prepared {0} salary slip(s). The PDF should open in a new tab.', [selected_slips.length]),
                            indicator: 'green'
                        });
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to generate PDF. Please try again.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Action: Submit ───────────────────────────────────────────────────────────

function submit_selected_salary_slips(dialog) {
    let selected_slips = [];
    dialog.fields_dict.drafts_html.$wrapper.find('.draft-checkbox:checked').each(function() {
        selected_slips.push($(this).data('slip-name'));
    });

    if (selected_slips.length === 0) {
        frappe.msgprint(__('Please select at least one salary slip'));
        return;
    }

    frappe.confirm(
        __('Submit {0} salary slip(s)? This action cannot be undone.', [selected_slips.length]),
        function() {
            dialog.hide();
            frappe.dom.freeze(__('Submitting {0} salary slip(s)… Please wait.', [selected_slips.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_submit_salary_slips',
                args: { salary_slip_names: selected_slips },
                callback: function(r) {
                    frappe.dom.unfreeze();
                    if (r.message) {
                        show_result_dialog(__('Submission Complete'), r.message, 'Submitted');
                        cur_list.refresh();
                    }
                },
                error: function() {
                    frappe.dom.unfreeze();
                    frappe.msgprint({ title: __('Error'), message: __('Failed to submit salary slips. Please try again.'), indicator: 'red' });
                }
            });
        }
    );
}

// ─── Result Dialog ────────────────────────────────────────────────────────────

function show_result_dialog(title, result, action_label) {
    let has_errors = result.errors && result.errors.length > 0;

    let errors_html = '';
    if (has_errors) {
        let items = result.errors.map(e => `<li style="margin-bottom:4px;">${e}</li>`).join('');
        errors_html = `
            <div style="margin-top:16px;">
                <div style="font-weight:600;margin-bottom:6px;color:var(--red-600);">Errors (${result.errors.length})</div>
                <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-muted);max-height:150px;overflow-y:auto;">
                    ${items}
                </ul>
            </div>`;
    }

    frappe.msgprint({
        title: title,
        indicator: has_errors ? 'orange' : 'green',
        message: `
            <div style="display:flex;gap:20px;margin-bottom:12px;">
                <div style="flex:1;padding:12px 16px;background:var(--bg-green);border-radius:var(--border-radius);text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--green-600);">${result.success}</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Successfully ${action_label}</div>
                </div>
                <div style="flex:1;padding:12px 16px;background:${result.failed > 0 ? 'var(--bg-red)' : 'var(--control-bg)'};border-radius:var(--border-radius);text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:${result.failed > 0 ? 'var(--red-600)' : 'var(--text-muted)'};">${result.failed}</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Failed</div>
                </div>
            </div>
            ${errors_html}
        `
    });
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

// ─── Form Helpers ─────────────────────────────────────────────────────────────

function check_duplicate_and_fetch(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.check_duplicate_salary_slip",
        args: { employee: frm.doc.employee, start_date: frm.doc.start_date, current_doc: frm.doc.name || "" },
        callback(r) {
            if (r.message && r.message.status === "duplicate") {
                frappe.msgprint(r.message.message);
                frm.set_value("start_date", "");
                return;
            }
            fetch_salary(frm);
            fetch_days_and_attendance(frm);
        }
    });
}

function set_end_date(frm) {
    let start = frappe.datetime.str_to_obj(frm.doc.start_date);
    let end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    frm.set_value("end_date", frappe.datetime.obj_to_str(end));
}

function fetch_salary(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: { employee: frm.doc.employee, start_date: frm.doc.start_date },
        callback(r) {
            if (!r.message) { frappe.msgprint("No Salary Structure found"); return; }

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
            fetch_variable_pay_percentage(frm);
            fetch_days_and_attendance(frm);
        }
    });
}

function fetch_variable_pay_percentage(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) { recalculate_salary(frm); return; }

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_variable_pay_percentage",
        args: { employee: frm.doc.employee, start_date: frm.doc.start_date },
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
        args: { employee: frm.doc.employee, start_date: frm.doc.start_date, working_days_calculation_method: frm.doc.working_days_calculation_method },
        callback(r) {
            if (!r.message) return;
            let d = r.message;
            frm.set_value({
                total_working_days: d.working_days,
                payment_days:       d.payment_days,
                present_days:       d.present_days,
                absent_days:        d.absent_days,
                weekly_offs_count:  d.weekly_offs,
                total_half_days:    d.total_half_days,
                total_lwp:          d.total_lwp || 0,
                total_holidays:     d.total_holidays || 0
            });
            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {
    let total_earnings = 0, total_deductions = 0, total_basic_da = 0;
    let total_employer_contribution = 0, retention = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);
    let basic_amount = 0, da_amount = 0, conveyance_amount = 0;

    (frm.doc.earnings || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;
        let amount = 0;
        if (row.salary_component && row.salary_component.toLowerCase().includes("variable")) {
            amount = (wd > 0 && row.depends_on_payment_days) ? (base / wd) * pd * variable_pct : base * variable_pct;
        } else {
            amount = (row.depends_on_payment_days && wd > 0) ? (base / wd) * pd : base;
        }
        row.amount = flt(amount, 2);
        total_earnings += row.amount;
        let comp = (row.salary_component || "").toLowerCase();
        if (comp.includes("basic"))                          basic_amount      = row.amount;
        if (comp.includes("da") || comp.includes("dearness")) da_amount         = row.amount;
        if (comp.includes("conveyance"))                      conveyance_amount = row.amount;
    });

    total_basic_da = basic_amount + da_amount;

    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;
        let amount = 0;
        let comp = (row.salary_component || "").toLowerCase();

        if (comp.includes("esic") && !comp.includes("employer")) {
            amount = (base > 0 && total_earnings < 21000) ? flt((total_earnings - conveyance_amount) * 0.0075, 2) : 0;
        } else if (comp.includes("esic") && comp.includes("employer")) {
            amount = (base > 0 && total_earnings < 21000) ? flt((total_earnings - conveyance_amount) * 0.0325, 2) : 0;
        } else if (comp.includes("pf") || comp.includes("provident")) {
            if (base > 0) {
                let basic_da_total = basic_amount + da_amount;
                amount = basic_da_total >= 15000 ? 1800 : flt(basic_da_total * 0.12, 2);
            }
        } else {
            amount = (row.depends_on_payment_days && wd > 0 && base > 0) ? (base / wd) * pd : base;
        }

        row.amount = flt(amount, 2);
        if (row.employer_contribution) total_employer_contribution += row.amount;
        else                           total_deductions             += row.amount;
        if (comp.includes("retention")) retention += row.amount;
    });

    let net_salary = flt(total_earnings - total_deductions, 2);
    frm.set_value({
        total_earnings: flt(total_earnings, 2),
        total_deductions: flt(total_deductions, 2),
        net_salary,
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
        total_working_days: 0, payment_days: 0, present_days: 0, absent_days: 0,
        weekly_offs_count: 0, total_half_days: 0, total_lwp: 0, total_holidays: 0,
        total_earnings: 0, total_deductions: 0, net_salary: 0,
        total_basic_da: 0, total_employer_contribution: 0, retention: 0
    });
    frm.variable_pay_percentage = 0;
    frm.refresh_fields();
}