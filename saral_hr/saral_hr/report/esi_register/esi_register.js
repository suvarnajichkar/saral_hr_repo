frappe.query_reports["ESI Report"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            reqd: 1
        },
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: "\n2023\n2024\n2025\n2026\n2027",
            reqd: 1
        },
        {
            fieldname: "month",
            label: __("Month"),
            fieldtype: "Select",
            options: "\nJanuary\nFebruary\nMarch\nApril\nMay\nJune\nJuly\nAugust\nSeptember\nOctober\nNovember\nDecember",
            reqd: 1
        }
    ],

    onload: function(report) {
        setTimeout(function() {
            // Set current year
            let current_year = new Date().getFullYear().toString();
            report.set_filter_value("year", current_year);

            // Set current month
            const months = [
                "January", "February", "March", "April",
                "May", "June", "July", "August",
                "September", "October", "November", "December"
            ];
            report.set_filter_value("month", months[new Date().getMonth()]);
        }, 500);
    }
};