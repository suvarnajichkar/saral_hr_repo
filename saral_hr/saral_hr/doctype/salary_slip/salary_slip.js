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

function show_bulk_salary_slip_dialog() {
    let d = new frappe.ui.Dialog({
        title: 'Bulk Generate Salary Slips',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
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
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
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

function show_draft_to_submit_dialog() {
    let d = new frappe.ui.Dialog({
        title: 'Submit Draft Salary Slips',
        fields: [
            {
                fieldname: 'company',
                fieldtype: 'Link',
                label: 'Company',
                options: 'Company',
                reqd: 1
            },
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
                fieldname: 'fetch_drafts',
                fieldtype: 'Button',
                label: 'Fetch Draft Slips',
                click: function() {
                    fetch_draft_salary_slips(d);
                }
            },
            {
                fieldname: 'section_break',
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'drafts_html',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: 'Submit Selected Slips',
        primary_action: function(values) {
            submit_selected_salary_slips(d);
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
    let company = dialog.get_value('company');
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

    if (!company) {
        frappe.msgprint(__('Please select Company'));
        return;
    }

    if (!year || !month) {
        frappe.msgprint(__('Please select Year and Month'));
        return;
    }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_eligible_employees_for_salary_slip',
        args: {
            company: company,
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
    let company = dialog.get_value('company');
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

    if (!company) {
        frappe.msgprint(__('Please select Company'));
        return;
    }

    if (!year || !month) {
        frappe.msgprint(__('Please select Year and Month'));
        return;
    }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_submitted_salary_slips',
        args: {
            company: company,
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

function fetch_draft_salary_slips(dialog) {
    let company = dialog.get_value('company');
    let year = dialog.get_value('year');
    let month = dialog.get_value('month');

    if (!company) {
        frappe.msgprint(__('Please select Company'));
        return;
    }

    if (!year || !month) {
        frappe.msgprint(__('Please select Year and Month'));
        return;
    }

    frappe.call({
        method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_draft_salary_slips',
        args: {
            company: company,
            year: year,
            month: month
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                display_draft_slips_table(dialog, r.message);
            } else {
                dialog.fields_dict.drafts_html.$wrapper.html(
                    '<div class="text-muted" style="padding: 20px; text-align: center;">No draft salary slips found for the selected period.</div>'
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

    dialog.fields_dict.employees_html.$wrapper.find('#select_all_employees').on('change', function() {
        let checked = $(this).prop('checked');
        dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox').prop('checked', checked);
        update_selected_count(dialog);
    });

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

    dialog.fields_dict.slips_html.$wrapper.find('#select_all_slips').on('change', function() {
        let checked = $(this).prop('checked');
        dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox').prop('checked', checked);
        update_selected_slips_count(dialog);
    });

    dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox').on('change', function() {
        update_selected_slips_count(dialog);
    });

    update_selected_slips_count(dialog);
}

function display_draft_slips_table(dialog, slips) {
    let html = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="table table-bordered" style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                    <tr>
                        <th style="width: 50px;">
                            <input type="checkbox" id="select_all_drafts" style="cursor: pointer;">
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
                    <input type="checkbox" class="draft-checkbox" 
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
            <span id="selected_drafts_count" style="font-weight: bold;">0 salary slips selected</span>
        </div>
    `;

    dialog.fields_dict.drafts_html.$wrapper.html(html);

    dialog.fields_dict.drafts_html.$wrapper.find('#select_all_drafts').on('change', function() {
        let checked = $(this).prop('checked');
        dialog.fields_dict.drafts_html.$wrapper.find('.draft-checkbox').prop('checked', checked);
        update_selected_drafts_count(dialog);
    });

    dialog.fields_dict.drafts_html.$wrapper.find('.draft-checkbox').on('change', function() {
        update_selected_drafts_count(dialog);
    });

    update_selected_drafts_count(dialog);
}

function update_selected_count(dialog) {
    let count = dialog.fields_dict.employees_html.$wrapper.find('.employee-checkbox:checked').length;
    dialog.fields_dict.employees_html.$wrapper.find('#selected_count').text(count + ' employee(s) selected');
}

function update_selected_slips_count(dialog) {
    let count = dialog.fields_dict.slips_html.$wrapper.find('.slip-checkbox:checked').length;
    dialog.fields_dict.slips_html.$wrapper.find('#selected_slips_count').text(count + ' salary slip(s) selected');
}

function update_selected_drafts_count(dialog) {
    let count = dialog.fields_dict.drafts_html.$wrapper.find('.draft-checkbox:checked').length;
    dialog.fields_dict.drafts_html.$wrapper.find('#selected_drafts_count').text(count + ' salary slip(s) selected');
}

function generate_bulk_salary_slips(dialog) {
    let company = dialog.get_value('company');
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

            frappe.dom.freeze(__('Generating Salary Slips for {0} employee(s)... Please wait...', [selected_employees.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_generate_salary_slips',
                args: {
                    employees: selected_employees,
                    year: year,
                    month: month
                },
                callback: function(r) {
                    frappe.dom.unfreeze();

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

                        cur_list.refresh();
                    }
                },
                error: function(r) {
                    frappe.dom.unfreeze();

                    frappe.msgprint({
                        title: __('Error'),
                        message: __('Failed to generate salary slips. Please try again.'),
                        indicator: 'red'
                    });
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

            frappe.dom.freeze(__('Generating PDF for {0} salary slip(s)... Please wait...', [selected_slips.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_print_salary_slips',
                args: {
                    salary_slip_names: selected_slips
                },
                callback: function(r) {
                    frappe.dom.unfreeze();

                    if (r.message) {
                        window.open(r.message.pdf_url, '_blank');

                        frappe.msgprint({
                            title: __('Print Ready'),
                            message: `Successfully prepared ${selected_slips.length} salary slip(s) for printing.`,
                            indicator: 'green'
                        });
                    }
                },
                error: function(r) {
                    frappe.dom.unfreeze();

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
        `Are you sure you want to submit ${selected_slips.length} salary slip(s)?`,
        function() {
            dialog.hide();

            frappe.dom.freeze(__('Submitting {0} salary slip(s)... Please wait...', [selected_slips.length]));

            frappe.call({
                method: 'saral_hr.saral_hr.doctype.salary_slip.salary_slip.bulk_submit_salary_slips',
                args: {
                    salary_slip_names: selected_slips
                },
                callback: function(r) {
                    frappe.dom.unfreeze();

                    if (r.message) {
                        let result = r.message;
                        let msg = `
                            <div style="margin-bottom: 15px;">
                                <strong>Salary Slips Submission Complete!</strong>
                            </div>
                            <table class="table table-bordered">
                                <tr>
                                    <td><strong>Successfully Submitted:</strong></td>
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
                            title: __('Bulk Submission Result'),
                            message: msg,
                            indicator: 'green'
                        });

                        cur_list.refresh();
                    }
                },
                error: function(r) {
                    frappe.dom.unfreeze();

                    frappe.msgprint({
                        title: __('Error'),
                        message: __('Failed to submit salary slips. Please try again.'),
                        indicator: 'red'
                    });
                }
            });
        }
    );
}

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
    amount(frm) {
        recalculate_salary(frm);
    },
    earnings_remove(frm) {
        recalculate_salary(frm);
    },
    deductions_remove(frm) {
        recalculate_salary(frm);
    }
});

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
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure found");
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
            fetch_variable_pay_percentage(frm);
            fetch_days_and_attendance(frm);
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

        if (row.salary_component &&
            row.salary_component.toLowerCase().includes("variable")) {

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

        if (comp.includes("basic")) {
            basic_amount = row.amount;
        }
        if (comp.includes("da") || comp.includes("dearness")) {
            da_amount = row.amount;
        }
        if (comp.includes("conveyance")) {
            conveyance_amount = row.amount;
        }
    });

    total_basic_da = basic_amount + da_amount;

    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;
        let comp = (row.salary_component || "").toLowerCase();

        // ESIC Employee
        if (comp.includes("esic") && !comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0075, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // ESIC Employer
        else if (comp.includes("esic") && comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0325, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // PF
        else if (comp.includes("pf") || comp.includes("provident")) {
            if (base > 0) {
                let basic_da_total = basic_amount + da_amount;
                if (basic_da_total >= 15000) {
                    amount = 1800;
                } else {
                    amount = flt(basic_da_total * 0.12, 2);
                }
            } else {
                amount = 0;
            }
        }
        // All other deductions including Professional Tax — use base_amount as-is
        else {
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

        if (comp.includes("retention")) {
            retention += row.amount;
        }
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
    frm.refresh_fields();
}