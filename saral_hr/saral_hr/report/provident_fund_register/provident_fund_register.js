// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Provident Fund Register"] = {
    filters: [
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: get_pf_year_options(),
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
        }
    ],

    onload: function(report) {
        frappe.after_ajax(() => {
            report.page.set_primary_action(__("Print"), () => {
                pf_register_print(report);
            }, "printer");
        });
    },

    formatter: function(value, row, column, data, default_formatter) {
        if (!data) return default_formatter(value, row, column, data);
        const fn = column.fieldname;

        if (data._row_type === "total") {
            if (["pf_no","uan_no","days","absent","date_of_joining","date_of_birth"].includes(fn)) return "";
            value = default_formatter(value, row, column, data);
            return `<strong>${value}</strong>`;
        }
        if ((fn === "vol_pf") && (value === null || value === undefined || value === "")) return "";
        return default_formatter(value, row, column, data);
    }
};

function get_pf_year_options() {
    let y = new Date().getFullYear();
    let years = [""];
    for (let i = y - 2; i <= y + 1; i++) years.push(i.toString());
    return years;
}

// ── Print ─────────────────────────────────────────────────────────────────────

function pf_register_print(report) {
    let data    = frappe.query_report.data || [];
    let filters = frappe.query_report.get_values() || {};
    let month   = filters.month || "";
    let year    = filters.year  || "";
    let company = frappe.boot.sysdefaults.company || "";

    let rows      = data.filter(r => r._row_type === "detail");
    let total_row = data.find(r => r._row_type === "total") || {};

    let tbody = rows.map((row, idx) => `
        <tr class="${idx % 2 !== 0 ? 'alt' : ''}">
            <td>${row.pf_no || ""}</td>
            <td>${row.uan_no || ""}</td>
            <td>${row.employee_id || ""}</td>
            <td>${row.employee_name || ""}</td>
            <td class="c">${row.days !== null ? row.days : ""}</td>
            <td class="c">${row.absent !== null ? row.absent : ""}</td>
            <td class="r">${fmt(row.gross)}</td>
            <td class="r">${fmt(row.basic_da)}</td>
            <td class="r">${fmt(row.emp_pf)}</td>
            <td class="r">${fmt(row.employer_eps)}</td>
            <td class="r">${fmt(row.employer_pf)}</td>
            <td class="r">${fmt(row.total_amount)}</td>
            <td class="r">${fmt(row.non_contrib)}</td>
            <td class="r">${row.vol_pf ? fmt(row.vol_pf) : ""}</td>
            <td class="r">${fmt(row.cumul_pf)}</td>
            <td class="r">${fmt(row.cumul_eps)}</td>
            <td class="r">${fmt(row.total_amount2)}</td>
            <td class="c">${row.date_of_joining || ""}</td>
            <td class="c">${row.date_of_birth || ""}</td>
        </tr>
    `).join("");

    tbody += `
        <tr class="total-row">
            <td colspan="6" class="total-label">Total</td>
            <td class="r">${fmt(total_row.gross)}</td>
            <td class="r">${fmt(total_row.basic_da)}</td>
            <td class="r">${fmt(total_row.emp_pf)}</td>
            <td class="r">${fmt(total_row.employer_eps)}</td>
            <td class="r">${fmt(total_row.employer_pf)}</td>
            <td class="r">${fmt(total_row.total_amount)}</td>
            <td class="r">${fmt(total_row.non_contrib)}</td>
            <td class="r">${total_row.vol_pf ? fmt(total_row.vol_pf) : ""}</td>
            <td class="r">${fmt(total_row.cumul_pf)}</td>
            <td class="r">${fmt(total_row.cumul_eps)}</td>
            <td class="r">${fmt(total_row.total_amount2)}</td>
            <td></td><td></td>
        </tr>
    `;

    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Provident Fund Register – ${month} ${year}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 8px;
            color: #333;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page {
            width: 420mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 10mm 12mm;
        }
        .header { text-align: center; margin-bottom: 12px; }
        .company-name { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #1a1a1a; }
        .report-title { font-size: 11px; font-weight: 600; color: #333; margin-top: 3px; }
        .period { font-size: 9px; color: #888; margin-top: 2px; }

        hr.divider { border: none; border-top: 1px solid #d1d8dd; margin-bottom: 12px; }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
            border: 1px solid #d1d8dd;
        }
        thead th {
            background: #f5f7fa;
            color: #555;
            font-weight: 600;
            font-size: 7.5px;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            padding: 6px 5px;
            border-bottom: 1px solid #d1d8dd;
            border-right: 1px solid #ebecee;
            text-align: center;
            white-space: nowrap;
        }
        thead th:last-child { border-right: none; }
        thead th.l { text-align: left; }

        tbody td {
            padding: 5px 5px;
            color: #333;
            border-bottom: 1px solid #ebecee;
            border-right: 1px solid #ebecee;
        }
        tbody td:last-child { border-right: none; }
        tbody tr:last-child td { border-bottom: none; }
        tr.alt { background-color: #fafbfc; }

        .c { text-align: center; }
        .r { text-align: right; white-space: nowrap; }

        .total-row td {
            background: #f5f7fa;
            font-weight: 700;
            color: #222;
            border-top: 1px solid #d1d8dd;
            border-bottom: none;
            padding: 6px 5px;
        }
        .total-label { text-align: right; color: #555; font-weight: 600; }

        .footer { margin-top: 30px; display: flex; justify-content: space-between; }
        .sign { text-align: center; width: 130px; }
        .sign .line { border-top: 1px solid #bbb; margin-bottom: 5px; }
        .sign .lbl { font-size: 7.5px; color: #999; text-transform: uppercase; letter-spacing: 0.8px; }

        @media print {
            @page { size: A3 landscape; margin: 0; }
            .page { padding: 10mm 12mm; }
        }
    </style>
</head>
<body>
<div class="page">
    <div class="header">
        <div class="company-name">${company}</div>
        <div class="report-title">Provident Fund Register</div>
        <div class="period">For the Month of ${month} ${year}</div>
    </div>
    <hr class="divider">
    <table>
        <thead>
            <tr>
                <th class="l" style="width:70px;">PF No.</th>
                <th class="l" style="width:80px;">UAN No.</th>
                <th class="l" style="width:80px;">Employee ID</th>
                <th class="l" style="width:110px;">Employee Name</th>
                <th style="width:40px;">Days<br>(LWP+ABS)</th>
                <th style="width:38px;">Absent</th>
                <th style="width:80px;">Gross Salary</th>
                <th style="width:75px;">BS+DA<br>(AR+CO)</th>
                <th style="width:75px;">Emp PF<br>12%</th>
                <th style="width:78px;">Er EPS<br>8.33%</th>
                <th style="width:78px;">Er PF<br>3.67%</th>
                <th style="width:75px;">Total<br>Amount</th>
                <th style="width:75px;">Non<br>Cont.</th>
                <th style="width:55px;">Vol PF</th>
                <th style="width:72px;">Cumul PF</th>
                <th style="width:72px;">Cumul EPS</th>
                <th style="width:75px;">Total<br>Amount</th>
                <th style="width:72px;">Date of<br>Joining</th>
                <th style="width:72px;">Date of<br>Birth</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
        </tbody>
    </table>
    <div class="footer">
        <div class="sign"><div class="line"></div><div class="lbl">Prepared By</div></div>
        <div class="sign"><div class="line"></div><div class="lbl">Checked By</div></div>
        <div class="sign"><div class="line"></div><div class="lbl">Authorised Signatory</div></div>
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