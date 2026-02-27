// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.ui.form.on("Category", {
    refresh(frm) {
        frm.set_df_property('category', 'hidden', 0);
        frm.set_df_property('category', 'read_only', frm.doc.__islocal ? 0 : 1);
        frm.refresh_field('category');
    }
});