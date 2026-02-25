// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Retention Deposit Register"] = {
    filters: [
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: get_year_options(),
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
            fieldtype: "Link",
            options: "Category",
            reqd: 1,
            default: ""
        },
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                let year      = frappe.query_report.get_filter_value("year");
                let month     = frappe.query_report.get_filter_value("month");
                let companies = frappe.query_report.get_filter_value("company");
                let category  = frappe.query_report.get_filter_value("category");

                return frappe.call({
                    method: "saral_hr.saral_hr.report.retention_deposit_register.retention_deposit_register.get_retention_employees_for_filter",
                    args: {
                        year:      year,
                        month:     month,
                        companies: JSON.stringify(companies || []),
                        category:  category || "",
                        txt:       txt || ""
                    }
                }).then(r => {
                    return (r.message || []).map(emp => ({
                        value:       emp.employee,
                        description: emp.employee_name || ""
                    }));
                });
            }
        }
    ],

    onload: function(report) {
        frappe.after_ajax(() => {
            report.page.set_primary_action(__("Print"), () => {
                retention_custom_print(report);
            }, "printer");
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────

function get_year_options() {
    let current_year = new Date().getFullYear();
    let years = [""];
    for (let i = current_year - 2; i <= current_year + 1; i++) {
        years.push(i.toString());
    }
    return years;
}

function retention_custom_print(report) {
    let data    = frappe.query_report.data || [];
    let filters = frappe.query_report.get_values() || {};

    let month = filters.month || "";
    let year  = filters.year  || "";

    let rows       = data.filter(r => r.employee_name !== "Total");
    let totals_row = data.find(r => r.employee_name === "Total") || {};

    let tbody = rows.map((row, idx) => `
        <tr>
            <td class="center">${idx + 1}</td>
            <td>${row.employee_id || ""}</td>
            <td>${row.employee_name || ""}</td>
            <td class="center">${fmt_date(row.date_of_joining)}</td>
            <td class="center">${fmt_date(row.ded_upto)}</td>
            <td class="num">${fmt(row.retention_amount)}</td>
        </tr>
    `).join("");

    tbody += `
        <tr class="total-row">
            <td colspan="5" style="text-align:right; padding-right:12px; font-weight:bold;">Total</td>
            <td class="num">${fmt(totals_row.retention_amount)}</td>
        </tr>
    `;

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Retention Deposit Register – ${month} ${year}</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
                .container { padding: 24px; }

                .header { text-align: center; margin-bottom: 16px; }
                .header .company-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
                .header .report-title { font-size: 13px; font-weight: bold; margin-top: 4px; }
                .header .period       { font-size: 11px; margin-top: 2px; color: #444; }

                table { width: 100%; border-collapse: collapse; margin-top: 12px; }

                thead tr th {
                    background-color: #e8e8e8;
                    border: 1px solid #999;
                    padding: 7px 8px;
                    text-align: center;
                    font-size: 11px;
                    font-weight: bold;
                }

                tbody tr td {
                    border: 1px solid #bbb;
                    padding: 6px 8px;
                    font-size: 11px;
                }

                tbody tr:nth-child(even):not(.total-row) { background-color: #f9f9f9; }

                td.num    { text-align: right; }
                td.center { text-align: center; }

                tr.total-row td {
                    font-weight: bold;
                    background-color: #eef4fb;
                    border-top: 2px solid #555;
                    border-bottom: 2px solid #555;
                }

                .footer {
                    margin-top: 40px;
                    display: flex;
                    justify-content: space-between;
                }
                .sign-block { text-align: center; width: 180px; }
                .sign-block .line  { border-top: 1px solid #000; margin-bottom: 4px; }
                .sign-block .label { font-size: 10px; color: #444; }

                @media print {
                    @page { size: A4 landscape; margin: 15mm; }
                    body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
        <div class="container">

            <div class="header">
                <div class="company-name">${frappe.boot.sysdefaults.company || ""}</div>
                <div class="report-title">Retention Deposit Register</div>
                <div class="period">For the Month of ${month} ${year}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:55px;">Sr. No.</th>
                        <th style="width:140px;">Employee ID</th>
                        <th style="width:200px;">Employee Name</th>
                        <th style="width:140px;">Date of Joining</th>
                        <th style="width:160px;">Ded. Upto (3 Yrs)</th>
                        <th style="width:150px;">Retention Deposit</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>

            <div class="footer">
                <div class="sign-block">
                    <div class="line"></div>
                    <div class="label">Prepared By</div>
                </div>
                <div class="sign-block">
                    <div class="line"></div>
                    <div class="label">Checked By</div>
                </div>
                <div class="sign-block">
                    <div class="line"></div>
                    <div class="label">Authorised Signatory</div>
                </div>
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

function fmt_date(val) {
    if (!val) return "-";
    let parts = val.split ? val.split("-") : [];
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return val;
}