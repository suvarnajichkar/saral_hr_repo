// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Category", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("Category", {
    refresh(frm) {
        add_field_help_icon(frm, 'salary_calculation_based_on');
    }
});

function add_field_help_icon(frm, fieldname) {
    setTimeout(() => {
        let field = frm.fields_dict[fieldname];
        if (!field) return;

        let field_wrapper = field.$wrapper;
        let label = field_wrapper.find('.control-label');
        let description = field.df.description;

        label.find('.custom-help-icon').remove();
        field_wrapper.find('.help-box').hide();

        let help_icon = $(`
            <span class="custom-help-icon" style="margin-left: 5px; cursor: help;">
                <svg class="icon icon-sm" style="width: 14px; height: 14px; color: #6c757d;">
                    <use href="#icon-help"></use>
                </svg>
            </span>
        `);

        label.append(help_icon);

        help_icon.tooltip({
            title: description,
            html: true,
            placement: 'right',
            container: 'body',
            trigger: 'hover'
        });

    }, 300);
}