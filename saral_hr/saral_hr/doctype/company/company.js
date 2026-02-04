// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Company", {
    refresh(frm) {
        // Add help icon with hover tooltip for salary calculation field
        add_field_help_icon(frm, 'salary_calculation_based_on');
    }
});

/**
 * Add a help icon (?) next to field label with hover tooltip
 * @param {object} frm - The form object
 * @param {string} fieldname - The field to add help icon to
 */
function add_field_help_icon(frm, fieldname) {
    // Wait for field to be fully rendered
    setTimeout(() => {
        let field = frm.fields_dict[fieldname];
        if (!field) return;
        
        let field_wrapper = field.$wrapper;
        let label = field_wrapper.find('.control-label');
        let description = field.df.description;
        
        // Remove existing help icon if any
        label.find('.custom-help-icon').remove();
        
        // Hide the description box below the field (we'll show it in tooltip)
        field_wrapper.find('.help-box').hide();
        
        // Add help icon next to label
        let help_icon = $(`
            <span class="custom-help-icon" style="margin-left: 5px; cursor: help;">
                <svg class="icon icon-sm" style="width: 14px; height: 14px; color: #6c757d;">
                    <use href="#icon-help"></use>
                </svg>
            </span>
        `);
        
        label.append(help_icon);
        
        // Initialize tooltip on the help icon
        help_icon.tooltip({
            title: description,
            html: true,
            placement: 'right',
            container: 'body',
            trigger: 'hover'
        });
        
    }, 300);
}