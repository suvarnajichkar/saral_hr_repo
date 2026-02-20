// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Transaction Checklist"] = {
    filters: [
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
        },
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                return frappe.db.get_link_options("Company", txt);
            }
        },
        {
            fieldname: "category",
            label: __("Category"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                return frappe.db.get_link_options("Category", txt);
            }
        },
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                let companies = frappe.query_report.get_filter_value("company") || [];
                let result = [];

                frappe.call({
                    method: "saral_hr.saral_hr.report.transaction_checklist.transaction_checklist.get_employees_for_filter",
                    args: {
                        companies: JSON.stringify(companies),
                        txt: txt || ""
                    },
                    async: false,
                    callback: function(r) {
                        result = (r.message || []).map(emp => ({
                            value: emp.employee,
                            description: emp.employee_name
                        }));
                    }
                });

                return result;
            }
        }
    ],

    onload: function(report) {
        frappe.after_ajax(() => {
            report.page.set_primary_action(__("Print"), () => {
                transaction_custom_print(report);
            }, "printer");
        });
    }
};

function transaction_custom_print(report) {
    let data    = frappe.query_report.data || [];
    let filters = frappe.query_report.get_values() || {};

    let month = filters.month || "";
    let year  = filters.year  || "";

    if (!data.length) {
        frappe.msgprint(__("No data to print."));
        return;
    }

    let columns = frappe.query_report.columns || [];

    let thead = columns.map(col => `<th>${col.label}</th>`).join("");

    let tbody = data.map(row => {
        let cells = columns.map(col => {
            let val = row[col.fieldname];
            if (val === null || val === undefined) return `<td></td>`;
            if (col.fieldtype === "Currency" || col.fieldtype === "Float") {
                return `<td class="num">${fmt(val)}</td>`;
            }
            return `<td>${val}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
    }).join("");

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Transaction Checklist – ${month} ${year}</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
                .container { padding: 24px; }
                .header { text-align: center; margin-bottom: 16px; }
                .header .company-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
                .header .report-title { font-size: 13px; font-weight: bold; margin-top: 4px; }
                .header .period { font-size: 11px; margin-top: 2px; color: #444; }
                table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                thead tr th { background-color: #e8e8e8; border: 1px solid #999; padding: 6px 7px; text-align: center; font-size: 10px; font-weight: bold; white-space: nowrap; }
                tbody tr td { border: 1px solid #bbb; padding: 5px 7px; font-size: 10px; white-space: nowrap; }
                tbody tr:nth-child(even) { background-color: #f9f9f9; }
                td.num { text-align: right; }
                .footer { margin-top: 40px; display: flex; justify-content: space-between; }
                .sign-block { text-align: center; width: 180px; }
                .sign-block .line { border-top: 1px solid #000; margin-bottom: 4px; }
                .sign-block .label { font-size: 10px; color: #444; }
                @media print {
                    @page { size: A3 landscape; margin: 10mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
        <div class="container">
            <div class="header">
                <div class="company-name">${frappe.boot.sysdefaults.company || ""}</div>
                <div class="report-title">Transaction Checklist</div>
                <div class="period">For the Month of ${month} ${year}</div>
            </div>
            <table>
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
            <div class="footer">
                <div class="sign-block"><div class="line"></div><div class="label">Prepared By</div></div>
                <div class="sign-block"><div class="line"></div><div class="label">Checked By</div></div>
                <div class="sign-block"><div class="line"></div><div class="label">Authorised Signatory</div></div>
            </div>
        </div>
        </body>
        </html>
    `;

    let w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

function fmt(val) {
    return parseFloat(val || 0).toFixed(2);
}