// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Variable Pay Register"] = {
    filters: [
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: get_vp_year_options(),
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
                    method: "saral_hr.saral_hr.report.variable_pay_register.variable_pay_register.get_vp_employees_for_filter",
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
                vp_custom_print(report);
            }, "printer");
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────

function get_vp_year_options() {
    let y = new Date().getFullYear();
    let years = [""];
    for (let i = y - 2; i <= y + 1; i++) years.push(i.toString());
    return years;
}

// ── Custom Print ──────────────────────────────────────────────────────────────

function vp_custom_print(report) {
    let data    = frappe.query_report.data || [];
    let filters = frappe.query_report.get_values() || {};

    let month    = filters.month    || "";
    let year     = filters.year     || "";
    let category = filters.category || "";
    let company  = (filters.company && filters.company.length)
                    ? filters.company.join(", ")
                    : (frappe.boot.sysdefaults.company || "");

    let rows      = data.filter(r => r.employee_name !== "Total");
    let total_row = data.find(r => r.employee_name === "Total") || {};

    let tbody = rows.map((row, idx) => `
        <tr class="${idx % 2 !== 0 ? 'alt' : ''}">
            <td class="c">${idx + 1}</td>
            <td>${row.employee_id || ""}</td>
            <td>${row.employee_name || ""}</td>
            <td>${row.division || "-"}</td>
            <td class="r">${fmt(row.monthly_variable_pay)}</td>
            <td class="c">${(row.variable_pay_percentage !== null && row.variable_pay_percentage !== undefined && row.variable_pay_percentage !== "")
                ? fmt(row.variable_pay_percentage) + "%" : "-"}</td>
            <td class="r">${fmt(row.variable_pay_amount)}</td>
        </tr>
    `).join("");

    tbody += `
        <tr class="total-row">
            <td colspan="4" style="text-align:right; padding-right:12px;">Total</td>
            <td class="r">${fmt(total_row.monthly_variable_pay)}</td>
            <td class="c">-</td>
            <td class="r">${fmt(total_row.variable_pay_amount)}</td>
        </tr>
    `;

    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Variable Pay Register – ${month} ${year}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         "Helvetica Neue", Arial, sans-serif;
            font-size: 11px;
            color: #1f272e;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 14mm 16mm;
        }

        /* ── Header ── */
        .header {
            text-align: center;
            margin-bottom: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid #d1d8dd;
        }
        .company-name {
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            color: #1a1a1a;
        }
        .category-name {
            font-size: 10.5px;
            color: #2490EF;
            font-weight: 600;
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .report-title {
            font-size: 13px;
            font-weight: 600;
            margin-top: 4px;
            color: #36414c;
        }
        .period {
            font-size: 10.5px;
            color: #8d99a6;
            margin-top: 2px;
        }

        /* ── Table ── */
        .table-wrap {
            border: 1px solid #d1d8dd;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 14px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        thead tr { background-color: #f0f4f7; }
        thead th {
            padding: 8px 10px;
            font-weight: 600;
            font-size: 10px;
            color: #6c7680;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            border-bottom: 1px solid #d1d8dd;
            text-align: center;
            white-space: nowrap;
        }
        thead th.th-left { text-align: left; }

        tbody tr { border-bottom: 1px solid #ebeff2; }
        tbody tr:last-child { border-bottom: none; }
        tr.alt { background-color: #fafbfc; }

        tbody td {
            padding: 7px 10px;
            color: #36414c;
            vertical-align: middle;
        }
        td.r { text-align: right; white-space: nowrap; }
        td.c { text-align: center; }

        /* ── Total row ── */
        tr.total-row {
            background-color: #f0f4f7;
            border-top: 1px solid #d1d8dd;
        }
        tr.total-row td {
            font-weight: 700;
            color: #1f272e;
            padding: 8px 10px;
        }

        /* ── Footer ── */
        .footer {
            margin-top: 44px;
            display: flex;
            justify-content: space-between;
        }
        .sign-block { text-align: center; width: 160px; }
        .sign-block .line { border-top: 1px solid #adb5bd; margin-bottom: 5px; }
        .sign-block .label {
            font-size: 9px;
            color: #8d99a6;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            .page { padding: 14mm 16mm; }
            body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
<div class="page">

    <div class="header">
        <div class="company-name">${company}</div>
        ${category ? `<div class="category-name">${category}</div>` : ''}
        <div class="report-title">Variable Pay Register</div>
        <div class="period">For the Month of ${month} ${year}</div>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th style="width:45px;">Sr. No.</th>
                    <th class="th-left" style="width:130px;">Employee ID</th>
                    <th class="th-left">Employee Name</th>
                    <th class="th-left" style="width:110px;">Division</th>
                    <th style="width:140px;">Monthly Variable Pay</th>
                    <th style="width:100px;">Variable Pay %</th>
                    <th style="width:140px;">Variable Pay Amount</th>
                </tr>
            </thead>
            <tbody>
                ${tbody}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <div class="sign-block"><div class="line"></div><div class="label">Prepared By</div></div>
        <div class="sign-block"><div class="line"></div><div class="label">Checked By</div></div>
        <div class="sign-block"><div class="line"></div><div class="label">Authorised Signatory</div></div>
    </div>

</div>
</body>
</html>`;

    let w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 800);
}

function fmt(val) {
    if (val === null || val === undefined || val === "") return "";
    return parseFloat(val || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}