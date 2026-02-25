frappe.listview_settings["Employee"] = {
    get_form_link: function(doc) {
        return "/app/employee-profile/" + doc.name;
    },
    onload: function(listview) {
        setTimeout(function() {
            listview.page.main.find(".list-row a.bold, .list-row .level-item a").each(function() {
                var row = $(this).closest(".list-row");
                var name = row.attr("data-name");
                if (name) {
                    $(this).attr("href", "/app/employee-profile/" + name);
                }
            });
        }, 500);
    },
    refresh: function(listview) {
        setTimeout(function() {
            listview.page.main.find(".list-row a.bold, .list-row .level-item a").each(function() {
                var row = $(this).closest(".list-row");
                var name = row.attr("data-name");
                if (name) {
                    $(this).attr("href", "/app/employee-profile/" + name);
                }
            });
        }, 300);
    }
};