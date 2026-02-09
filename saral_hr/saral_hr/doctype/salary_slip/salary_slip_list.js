frappe.listview_settings['Salary Slip'] = {
    onload: function(listview) {
        // Bulk Generate Button
        listview.page.add_inner_button(__('Bulk Generate Salary Slips'), function() {
            show_bulk_salary_slip_dialog();
        });

        // Bulk Print Button
        listview.page.add_inner_button(__('Bulk Print Salary Slips'), function() {
            show_bulk_print_dialog();
        });
    }
};

function show_bulk_salary_slip_dialog() {
    let d = new frappe.ui.Dialog({
        title: 'Bulk Generate Salary Slips',
        fields: [
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: 'Year',
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString()
            },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: 'Month',
                options: [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ],
                reqd: 1,
                default: get_current_month()
            },
            {
                fieldname: 'fetch_employees',
                fieldtype: 'Button',
                label: 'Fetch Employees',
                click: function() {
                    fetch_eligible_employees(d);
                }
            },
            {
                fieldname: 'section_break',
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'employees_html',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: 'Generate Salary Slips',
        primary_action: function(values) {
            generate_bulk_salary_slips(d);
        }
    });

    d.show();
}

function show_bulk_print_dialog() {
    let d = new frappe.ui.Dialog({
        title: 'Bulk Print Salary Slips',
        fields: [
            {
                fieldname: 'year',
                fieldtype: 'Select',
                label: 'Year',
                options: get_year_options(),
                reqd: 1,
                default: new Date().getFullYear().toString()
            },
            {
                fieldname: 'month',
                fieldtype: 'Select',
                label: 'Month',
                options: [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ],
                reqd: 1,
                default: get_current_month()
            },
            {
                fieldname: 'fetch_slips',
                fieldtype: 'Button',
                label: 'Fetch Salary Slips',
                click: function() {
                    fetch_submitted_salary_slips(d);
                }
            },
            {
                fieldname: 'section_break',
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'slips_html',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: 'Print Selected Slips',
        primary_action: function(values) {
            print_selected_salary_slips(d);
        }
    });

    d.show();
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

function fetch_eligible_employees(dialog) {
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

    if (!year || !month) {
        frappe.msgprint(__('Please select Year and Month'));
        return;
    }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_eligible_employees_for_salary_slip',
        args: {
            year: year,
            month: month
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                display_employees_table(dialog, r.message);
            } else {
                dialog.fields_dict.employees_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No eligible employees found for the selected period.</div>'
                );
            }
        }
    });
}

function fetch_submitted_salary_slips(dialog) {
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

    if (!year || !month) {
        frappe.msgprint(__('Please select Year and Month'));
        return;
    }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_submitted_salary_slips',
        args: {
            year: year,
            month: month
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                display_salary_slips_table(dialog, r.message);
            } else {
                dialog.fields_dict.slips_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No submitted salary slips found for the selected period.</div>'
                );
            }
        }
    });
}

function display_employees_table(dialog, employees) {
    let html = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="table table-bordered" style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                    <tr>
                        <th style="width: 50px;">
                            <input type="checkbox" id="select_all_employees" style="cursor: pointer;">
                        </th>
                        <th>Employee ID</th>
                        <th>Employee Name</th>
                        <th>Department</th>
                        <th>Designation</th>
                    </tr>
                </thead>
                <tbody>
    `;

    employees.forEach(emp => {
        html += `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="employee-checkbox" 
                           data-employee="${emp.name}" 
                           data-employee-name="${emp.employee_name}"
                           style="cursor: pointer;">
                </td>
                <td>${emp.name}</td>
                <td>${emp.employee_name || ''}</td>
                <td>${emp.department || ''}</td>
                <td>${emp.designation || ''}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <span id="selected_count" style="font-weight: bold;">0 employees selected</span>
        </div>
    `;

    dialog.fields_dict.employees_html.$wrapper.html(html);

    // Select all functionality
    dialog.fields_dict.employees_html.$wrapper.find('#select_all_employees').on('change', function() {
        let checked = $(this).prop('checked');
        dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox').prop('checked', checked);
        update_selected_count(dialog);
    });

    // Individual checkbox change
    dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox').on('change', function() {
        update_selected_count(dialog);
    });

    update_selected_count(dialog);
}

function display_salary_slips_table(dialog, slips) {
    let html = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="table table-bordered" style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                    <tr>
                        <th style="width: 50px;">
                            <input type="checkbox" id="select_all_slips" style="cursor: pointer;">
                        </th>
                        <th>Salary Slip ID</th>
                        <th>Employee ID</th>
                        <th>Employee Name</th>
                        <th>Department</th>
                        <th>Net Salary</th>
                    </tr>
                </thead>
                <tbody>
    `;

    slips.forEach(slip => {
        html += `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="slip-checkbox" 
                           data-slip-name="${slip.name}"
                           data-employee-name="${slip.employee_name}"
                           style="cursor: pointer;">
                </td>
                <td>${slip.name}</td>
                <td>${slip.employee}</td>
                <td>${slip.employee_name || ''}</td>
                <td>${slip.department || ''}</td>
                <td style="text-align: right;">${format_currency(slip.net_salary, 'INR')}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <span id="selected_slips_count" style="font-weight: bold;">0 salary slips selected</span>
        </div>
    `;

    dialog.fields_dict.slips_html.$wrapper.html(html);

    // Select all functionality
    dialog.fields_dict.slips_html.$wrapper.find('#select_all_slips').on('change', function() {
        let checked = $(this).prop('checked');
        dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox').prop('checked', checked);
        update_selected_slips_count(dialog);
    });

    // Individual checkbox change
    dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox').on('change', function() {
        update_selected_slips_count(dialog);
    });

    update_selected_slips_count(dialog);
}

function update_selected_count(dialog) {
    let count = dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox:checked').length;
    dialog.fields_dict.employees_html.$wrapper.find('#selected_count').text(count + ' employee(s) selected');
}

function update_selected_slips_count(dialog) {
    let count = dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox:checked').length;
    dialog.fields_dict.slips_html.$wrapper.find('#selected_slips_count').text(count + ' salary slip(s) selected');
}

function generate_bulk_salary_slips(dialog) {
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

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
        `Are you sure you want to generate salary slips for ${selected_employees.length} employee(s)?`,
        function() {
            dialog.hide();
            frappe.show_progress('Generating Salary Slips', 0, selected_employees.length, 'Please wait...');

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_generate_salary_slips',
                args: {
                    employees: selected_employees,
                    year: year,
                    month: month
                },
                callback: function(r) {
                    frappe.hide_progress();
                    
                    if (r.message) {
                        let result = r.message;
                        let msg = `
                            <div style="margin-bottom: 15px;">
                                <strong>Salary Slips Generation Complete!</strong>
                            </div>
                            <table class="table table-bordered">
                                <tr>
                                    <td><strong>Successfully Created:</strong></td>
                                    <td style="color: green; font-weight: bold;">${result.success}</td>
                                </tr>
                                <tr>
                                    <td><strong>Failed:</strong></td>
                                    <td style="color: red; font-weight: bold;">${result.failed}</td>
                                </tr>
                            </table>
                        `;

                        if (result.errors && result.errors.length > 0) {
                            msg += '<div style="margin-top: 15px;"><strong>Errors:</strong><ul>';
                            result.errors.forEach(error => {
                                msg += `<li>${error}</li>`;
                            });
                            msg += '</ul></div>';
                        }

                        frappe.msgprint({
                            title: __('Bulk Generation Result'),
                            message: msg,
                            indicator: 'green'
                        });

                        // Refresh the list view
                        cur_list.refresh();
                    }
                }
            });
        }
    );
}

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
        `Are you sure you want to print ${selected_slips.length} salary slip(s)?`,
        function() {
            dialog.hide();
            
            // FREEZE THE SCREEN with progress message
            frappe.freeze_screen = true;
            frappe.dom.freeze(__('Generating PDF for {0} salary slip(s)... Please wait...', [selected_slips.length]));
            
            // Call backend to generate combined PDF
            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_print_salary_slips',
                args: {
                    salary_slip_names: selected_slips
                },
                callback: function(r) {
                    // UNFREEZE THE SCREEN
                    frappe.dom.unfreeze();
                    frappe.freeze_screen = false;
                    
                    if (r.message) {
                        // Open the PDF in a new window (SINGLE WINDOW)
                        window.open(r.message.pdf_url, '_blank');
                        
                        frappe.msgprint({
                            title: __('Print Ready'),
                            message: `Successfully prepared ${selected_slips.length} salary slip(s) for printing.`,
                            indicator: 'green'
                        });
                    }
                },
                error: function(r) {
                    // UNFREEZE THE SCREEN even on error
                    frappe.dom.unfreeze();
                    frappe.freeze_screen = false;
                    
                    frappe.msgprint({
                        title: __('Error'),
                        message: __('Failed to generate PDF. Please try again.'),
                        indicator: 'red'
                    });
                }
            });
        }
    );
}