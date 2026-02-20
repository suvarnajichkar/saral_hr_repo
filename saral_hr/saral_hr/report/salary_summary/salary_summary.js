// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Salary Summary"] = {
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
            fieldname: "division",
            label: __("Division"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                return frappe.db.get_link_options("Department", txt);
            }
        }
    ],

    onload: function(report) {
        frappe.after_ajax(() => {
            report.page.set_primary_action(__("Print"), () => {
                salary_summary_print(report);
            }, "printer");

            // Hide Frappe's default report footer
            $("<style>")
                .text(`
                    .report-footer { display: none !important; }
                    .dt-footer { display: none !important; }
                    .filter-description { display: none !important; }
                    [data-label="filter-help"] { display: none !important; }
                    .datatable .dt-scrollable ~ div { display: none !important; }
                `)
                .appendTo("head");
        });
    },

    formatter: function(value, row, column, data, default_formatter) {
        if (!data) return default_formatter(value, row, column, data);
        const fn = column.fieldname;

        if (data._row_type === "grand_total") {
            if (fn === "spacer") return "";
            value = default_formatter(value, row, column, data);
            return `<strong>${value}</strong>`;
        }
        if (data._row_type === "section_header") {
            if (fn === "description") {
                return `<strong style="font-size:12px; border-bottom:2px solid #333;
                         padding-bottom:2px; display:block;">${value || ""}</strong>`;
            }
            return "";
        }
        if (data._row_type === "other") {
            if (fn === "description") return `<span style="font-weight:600;">${value || ""}</span>`;
            if (fn === "amount") return `<span style="font-weight:600;">${frappe.format(value, {fieldtype:"Float", precision:2})}</span>`;
            return "";
        }
        if (data._row_type === "separator") return "";
        if ((fn === "amount" || fn === "ded_amount") && (value === null || value === undefined || value === "")) return "";
        if (fn === "spacer") return "";

        return default_formatter(value, row, column, data);
    }
};

// ─────────────────────────────────────────────────────────────────────────────

function get_year_options() {
    let current_year = new Date().getFullYear();
    let years = [""];
    for (let i = current_year - 2; i <= current_year + 1; i++) years.push(i.toString());
    return years;
}

// ── Custom HTML/CSS Print ─────────────────────────────────────────────────────

function salary_summary_print(report) {
    let data    = frappe.query_report.data || [];
    let filters = frappe.query_report.get_values() || {};
    let month    = filters.month    || "";
    let year     = filters.year     || "";
    let category = filters.category || "";
    let company  = (filters.company && filters.company.length)
                    ? filters.company.join(", ")
                    : (frappe.boot.sysdefaults.company || "");

    let grand  = data.find(r => r._row_type === "grand_total") || {};
    let others = data.filter(r => r._row_type === "other");

    let earn_rows = data.filter(r => r._row_type === "component" && r.description);
    let ded_rows  = data.filter(r => r._row_type === "component" && r.ded_description);

    // Build earning rows HTML
    let earn_html = earn_rows.map((r, i) => `
        <tr class="${i % 2 !== 0 ? 'alt' : ''}">
            <td class="td-desc">${r.description || ""}</td>
            <td class="td-amt">${r.description ? fmt(r.amount) : ""}</td>
        </tr>
    `).join("");

    // Build deduction rows HTML
    let ded_html = ded_rows.map((r, i) => `
        <tr class="${i % 2 !== 0 ? 'alt' : ''}">
            <td class="td-desc">${r.ded_description || ""}</td>
            <td class="td-amt">${r.ded_description ? fmt(r.ded_amount) : ""}</td>
        </tr>
    `).join("");

    // Other details rows
    let other_html = others.map((r, i) => `
        <tr class="${i % 2 !== 0 ? 'alt' : ''}">
            <td class="td-desc">${r.description || ""}</td>
            <td class="td-amt">${fmt(r.amount)}</td>
        </tr>
    `).join("");

    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Salary Summary – ${month} ${year}</title>
    <style>
        *, *::before, *::after {
            margin: 0; padding: 0; box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         "Helvetica Neue", Arial, sans-serif;
            font-size: 11px;
            color: #1a1a1a;
            background: #fff;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 12mm 14mm;
        }

        /* ── Header ── */
        .header {
            text-align: center;
            padding-bottom: 12px;
            margin-bottom: 18px;
            border-bottom: 2px solid #2490EF;
        }
        .company-name {
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: #1a1a1a;
        }
        .category-name {
            font-size: 11px;
            color: #2490EF;
            font-weight: 600;
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .report-title {
            font-size: 13px;
            font-weight: 700;
            margin-top: 5px;
            color: #2c3e50;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .period {
            font-size: 10.5px;
            color: #555;
            margin-top: 3px;
        }

        /* ── Two-column layout ── */
        .columns {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 10px 0;
            margin-bottom: 0;
        }
        .col-panel {
            display: table-cell;
            width: 50%;
            vertical-align: top;
        }

        /* ── Section label ── */
        .section-label {
            background-color: #2490EF;
            color: #fff;
            text-align: center;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 7px 0;
            border-radius: 2px 2px 0 0;
        }

        /* ── Tables ── */
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        table thead tr {
            background-color: #EEF6FD;
        }
        table thead th {
            padding: 6px 10px;
            font-weight: 600;
            font-size: 10px;
            color: #2490EF;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            border-bottom: 1.5px solid #2490EF;
            border-top: 1px solid #d0e8fa;
        }
        table thead th.th-desc { text-align: left; }
        table thead th.th-amt  { text-align: right; border-left: 1px solid #d0e8fa; }

        .td-desc {
            padding: 5px 10px;
            border-bottom: 1px solid #e8edf0;
            color: #1a1a1a;
        }
        .td-amt {
            padding: 5px 10px;
            text-align: right;
            border-bottom: 1px solid #e8edf0;
            border-left: 1px solid #e8edf0;
            color: #1a1a1a;
            white-space: nowrap;
        }
        tr.alt { background-color: #F4F9FE; }

        .table-wrap {
            border: 1px solid #C2DCF7;
            border-top: none;
        }

        /* ── Grand Total ── */
        .grand-total-wrap {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 10px 0;
            margin-top: 0;
        }
        .grand-total-cell {
            display: table-cell;
            width: 50%;
        }
        .grand-total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #1a73e8;
            color: #fff;
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 700;
            border-radius: 0 0 3px 3px;
        }
        .grand-total-row .gt-label { letter-spacing: 0.5px; }
        .grand-total-row .gt-amt   { white-space: nowrap; font-size: 12px; }

        /* ── Other Details ── */
        .other-section { margin-top: 20px; }
        .other-title {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #fff;
            background: #2490EF;
            padding: 7px 12px;
            border-radius: 2px 2px 0 0;
        }
        .other-table-wrap {
            border: 1px solid #C2DCF7;
            border-top: none;
            margin-top: 0;
        }
        .other-table-wrap table thead th.th-amt {
            width: 180px;
        }

        /* ── Footer ── */
        .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
        }
        .sign-block { text-align: center; width: 160px; }
        .sign-block .line {
            border-top: 1px solid #555;
            margin-bottom: 5px;
        }
        .sign-block .label {
            font-size: 9px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { padding: 12mm 14mm; }
        }
    </style>
</head>
<body>
<div class="page">

    <!-- Header -->
    <div class="header">
        <div class="company-name">${company}</div>
        ${category ? `<div class="category-name">${category}</div>` : ''}
        <div class="report-title">Salary Summary</div>
        <div class="period">For the Month of ${month} ${year}</div>
    </div>

    <!-- Earnings & Deductions -->
    <div class="columns">
        <!-- Earnings -->
        <div class="col-panel">
            <div class="section-label">Earnings</div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th class="th-desc">Description</th>
                            <th class="th-amt">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${earn_html || '<tr><td class="td-desc" colspan="2" style="color:#aaa;text-align:center;padding:12px;">No Data</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        <!-- Deductions -->
        <div class="col-panel">
            <div class="section-label">Deductions</div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th class="th-desc">Description</th>
                            <th class="th-amt">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ded_html || '<tr><td class="td-desc" colspan="2" style="color:#aaa;text-align:center;padding:12px;">No Data</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Grand Total bar -->
    <div class="grand-total-wrap">
        <div class="grand-total-cell">
            <div class="grand-total-row">
                <span class="gt-label">Grand Total</span>
                <span class="gt-amt">${fmt(grand.amount)}</span>
            </div>
        </div>
        <div class="grand-total-cell">
            <div class="grand-total-row">
                <span class="gt-label">Grand Total</span>
                <span class="gt-amt">${fmt(grand.ded_amount)}</span>
            </div>
        </div>
    </div>

    <!-- Other Details -->
    <div class="other-section">
        <div class="other-title">Other Details</div>
        <div class="other-table-wrap">
            <table>
                <thead>
                    <tr>
                        <th class="th-desc">Description</th>
                        <th class="th-amt">Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${other_html}
                </tbody>
            </table>
        </div>
    </div>

    <!-- Footer -->
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