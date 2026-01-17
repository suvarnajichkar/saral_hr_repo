frappe.listview_settings["Attendance"] = {
    onload(list_view) {
        list_view.page.add_inner_button(__('Mark Attendance'), function () {
            // Dynamic URL using relative path
            const url = "/mark_attendance";
            window.location.href = frappe.urllib.get_full_url(url);
        });
    }
};
