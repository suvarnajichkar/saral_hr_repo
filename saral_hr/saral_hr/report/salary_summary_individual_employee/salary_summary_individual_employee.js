// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Salary Summary Individual Employee"] = {
    filters: [
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: "\n2023\n2024\n2025\n2026\n2027",
            reqd: 1,
            default: ""
        },
        {
            fieldname: "month",
            label: __("Month"),
            fieldtype: "Select",
            options: [
                "", "January", "February", "March", "April",
                "May", "June", "July", "August",
                "September", "October", "November", "December"
            ],
            reqd: 1,
            default: ""
        },
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "MultiSelectList",
            reqd: 1,
            get_data: function(txt) {
                return frappe.db.get_link_options("Company", txt);
            }
        },
        {
            fieldname: "category",
            label: __("Category"),
            fieldtype: "MultiSelectList",
            reqd: 1,
            get_data: function(txt) {
                return frappe.db.get_link_options("Category", txt);
            }
        },
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                let companies  = frappe.query_report.get_filter_value("company")  || [];
                let categories = frappe.query_report.get_filter_value("category") || [];
                let result = [];

                frappe.call({
                    method: "saral_hr.saral_hr.report.salary_summary_individual_employee.salary_summary_individual_employee.get_employees_for_filter",
                    args: {
                        companies:  JSON.stringify(companies),
                        categories: JSON.stringify(categories),
                        txt: txt || ""
                    },
                    async: false,
                    callback: function(r) {
                        result = (r.message || []).map(emp => ({
                            value:       emp.employee,
                            description: emp.employee_name
                        }));
                    }
                });

                return result;
            }
        }
    ],

    onload: function(report) {
        frappe.after_ajax(function() {
            report.page.set_primary_action(__("Print"), function() {
                salary_ind_print(report);
            }, "printer");
        });
    }
};

// ── Custom Print — Clean B&W, Centered Header ────────────────────────────────

function salary_ind_print(report) {
    var data    = frappe.query_report.data || [];
    var filters = frappe.query_report.get_values() || {};
    var cols    = frappe.query_report.columns || [];

    var month      = filters.month    || "";
    var year       = filters.year     || "";
    var categories = filters.category || [];
    var company    = (filters.company && filters.company.length)
                        ? filters.company.join(", ")
                        : (frappe.boot.sysdefaults.company || "");
    var cat_label  = (categories && categories.length) ? categories.join(", ") : "";

    if (!data.length) {
        frappe.msgprint(__("No data to print."));
        return;
    }

    var printed_on = new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
    });

    // ── Table header ──
    var thead = cols.map(function(col) {
        return '<th class="th-cell">' + (col.label || "") + '</th>';
    }).join("");

    // ── Table rows ──
    var tbody = data.map(function(row, idx) {
        var is_total = (row.employee_name === "Total");

        var cells = cols.map(function(col) {
            var val = row[col.fieldname];
            if (val === null || val === undefined || val === "") {
                return '<td class="td-cell' + (is_total ? ' total-cell' : '') + '"></td>';
            }
            if (col.fieldtype === "Float" || col.fieldtype === "Currency") {
                return '<td class="td-cell td-num' + (is_total ? ' total-cell' : '') + '">'
                     + parseFloat(val || 0).toFixed(2) + '</td>';
            }
            return '<td class="td-cell' + (is_total ? ' total-cell' : '') + '">'
                 + val + '</td>';
        }).join("");

        if (is_total) {
            return '<tr class="total-row">' + cells + '</tr>';
        }

        var alt = (idx % 2 !== 0) ? ' class="alt-row"' : '';
        return '<tr' + alt + '>' + cells + '</tr>';
    }).join("");

    // ── Signature block ──
    var sig_html = ""
        + '<div class="sign-block"><div class="sign-line"></div><div class="sign-label">Prepared By</div></div>'
        + '<div class="sign-block"><div class="sign-line"></div><div class="sign-label">Checked By</div></div>'
        + '<div class="sign-block"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>';

    // ── Full HTML ──
    var S = "";
    S += "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
    S += "<title>Salary Summary - " + month + " " + year + "</title>";
    S += "<style>";
    S += "*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }";
    S += "body { font-family: Arial, sans-serif; font-size: 7.5px; color: #000; background: #fff;";
    S += "       -webkit-print-color-adjust: exact; print-color-adjust: exact; }";

    // Header
    S += ".header { text-align: center; padding: 10px 0 8px; border-bottom: 2px solid #000; margin-bottom: 8px; }";
    S += ".co-name  { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }";
    S += ".cat-line { font-size: 8px; font-weight: 700; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }";
    S += ".rpt-title { font-size: 9px; font-weight: 600; margin-top: 3px; color: #333; }";
    S += ".period    { font-size: 11px; font-weight: 800; margin-top: 2px; }";
    S += ".printed   { font-size: 6.5px; color: #666; margin-top: 2px; }";

    // Table
    S += "table { border-collapse: collapse; width: 100%; font-size: 7px; }";
    S += "thead tr { background: #000; color: #fff; }";
    S += ".th-cell { padding: 4px 4px; border: 1px solid #000; font-weight: 700; font-size: 6.5px;";
    S += "           text-align: center; white-space: nowrap; }";
    S += ".td-cell { padding: 3px 4px; border: 1px solid #ccc; font-size: 7px; white-space: nowrap; }";
    S += ".td-num  { text-align: right; }";

    // Alt row & total
    S += ".alt-row td  { background: #f5f5f5; }";
    S += ".total-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; }";
    S += ".total-cell  { background: #e8e8e8 !important; font-weight: 700; }";

    // Signature
    S += ".footer     { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }";
    S += ".sign-block { text-align: center; width: 160px; }";
    S += ".sign-line  { border-top: 1px solid #000; margin-bottom: 4px; }";
    S += ".sign-label { font-size: 7.5px; color: #444; }";

    S += "@media print {";
    S += "  @page { size: A3 landscape; margin: 7mm 8mm; }";
    S += "  body { font-size: 7px; }";
    S += "}";
    S += "</style></head><body>";

    // Header — centered
    S += "<div class='header'>";
    S += "<div class='co-name'>" + company + "</div>";
    if (cat_label) {
        S += "<div class='cat-line'>" + cat_label + "</div>";
    }
    S += "<div class='rpt-title'>Salary Summary – Individual Employee</div>";
    S += "<div class='period'>" + month + "&nbsp;" + year + "</div>";
    S += "<div class='printed'>Printed on: " + printed_on + "</div>";
    S += "</div>";

    // Table
    S += "<table><thead><tr>" + thead + "</tr></thead><tbody>" + tbody + "</tbody></table>";

    // Signatures
    S += "<div class='footer'>" + sig_html + "</div>";

    S += "</body></html>";

    var w = window.open("", "_blank");
    if (!w) {
        frappe.msgprint({
            title: "Print Blocked",
            message: "Your browser blocked the print popup.<br><br>"
                   + "Please allow popups for this site, then click Print again.",
            indicator: "orange"
        });
        return;
    }
    w.document.write(S);
    w.document.close();
    w.focus();
    setTimeout(function() { w.print(); }, 600);
}