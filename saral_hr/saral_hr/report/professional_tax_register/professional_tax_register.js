// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Monthly Attendance Report"] = {
    filters: [
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: get_att_year_options(),
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
                    method: "saral_hr.saral_hr.report.monthly_attendance_report.monthly_attendance_report.get_att_employees_for_filter",
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

            // ── Aggressively hide Frappe's footer ──
            att_inject_footer_style();
            att_hide_footer(report);

            // Re-hide after renders
            [300, 800, 1500, 3000].forEach(t => setTimeout(() => att_hide_footer(report), t));

            // Override DataTable's refresh to keep footer hidden
            const _origRefresh = report.datatable && report.datatable.refresh;
            if (report.datatable) {
                const _orig = report.datatable.render;
                if (_orig) {
                    report.datatable.render = function() {
                        const result = _orig.apply(this, arguments);
                        att_hide_footer(report);
                        return result;
                    };
                }
            }

            // ── Legend bar below filters ──
            att_inject_legend(report);

            // ── Print button ──
            report.page.set_primary_action(__("Print"), function() {
                att_custom_print(report);
            }, "printer");
        });
    },

    formatter: function(value, row, column, data, default_formatter) {
        if (!data) return default_formatter(value, row, column, data);
        const fn = column.fieldname;

        if (data._is_total) {
            value = default_formatter(value, row, column, data);
            return "<strong>" + value + "</strong>";
        }

        // Format float summary fields to exactly 2 decimal places
        const floatFields = ["present_days", "half_days", "absent_days", "absent_lwp"];
        if (floatFields.includes(fn) && value !== null && value !== undefined && value !== "") {
            const num = parseFloat(value);
            if (!isNaN(num)) {
                return '<span>' + num.toFixed(2) + '</span>';
            }
        }

        if (fn.startsWith("day_")) {
            if (value === "P")   return '<span style="color:#2d8a4e;font-weight:600;">P</span>';
            if (value === "A")   return '<span style="color:#e03c3c;font-weight:600;">A</span>';
            if (value === "H")   return '<span style="color:#2490EF;font-weight:600;">H</span>';
            if (value === "WO")  return '<span style="color:#7c4dff;font-weight:600;">WO</span>';
            if (value === "LWP") return '<span style="color:#e07b39;font-weight:600;">LWP</span>';
            if (value === "HD")  return '<span style="color:#b8860b;font-weight:600;">HD</span>';
            if (!value || value === "-") return '<span style="color:#ccc;">-</span>';
        }

        return default_formatter(value, row, column, data);
    }
};

// ─────────────────────────────────────────────────────────────────────────────

function get_att_year_options() {
    var y = new Date().getFullYear();
    var years = [""];
    for (var i = y - 2; i <= y + 1; i++) years.push(String(i));
    return years;
}

// ── Footer hide helpers ───────────────────────────────────────────────────────

function att_inject_footer_style() {
    if (document.getElementById("att-hide-footer-style")) return;
    const s = document.createElement("style");
    s.id = "att-hide-footer-style";
    s.textContent = [
        ".report-wrapper > .form-message { display:none !important; }",
        ".dt-footer { display:none !important; }",
        ".query-report-run-btn-wrapper { display:none !important; }",
        // Extra selectors that Frappe uses in some versions
        ".datatable .dt-footer { display:none !important; }",
        ".report-wrapper .form-footer { display:none !important; }"
    ].join("\n");
    document.head.appendChild(s);
}

function att_hide_footer(report) {
    const wrapper = report && report.page && report.page.wrapper;
    if (!wrapper) return;
    wrapper.find(".report-wrapper > .form-message").hide();
    wrapper.find(".dt-footer").hide();
    wrapper.find(".form-footer").hide();
    // Also target by text content as fallback
    wrapper.find(".form-message").each(function() {
        if ($(this).text().includes("For comparison")) $(this).hide();
    });
}

// ── Legend bar ───────────────────────────────────────────────────────────────

function att_inject_legend(report) {
    const wrapper = report.page.wrapper;
    if (wrapper.find(".att-legend-bar").length) return;

    const legend_html = `
        <div class="att-legend-bar" style="
            display:grid;
            grid-template-columns:repeat(3,1fr);
            gap:10px 0;
            padding:12px 16px;
            margin:8px 15px 4px 15px;
            border-top:1px solid #e0e4e8;
            border-bottom:1px solid #e0e4e8;
            font-size:12px;
            color:#333;">
            <span style="display:flex;align-items:center;gap:6px;padding-right:16px;border-right:1px solid #e0e4e8;">
                <b style="color:#2d8a4e;font-size:14px;min-width:30px;">P</b><span style="color:#555;">– Present</span>
            </span>
            <span style="display:flex;align-items:center;gap:6px;padding:0 16px;border-right:1px solid #e0e4e8;">
                <b style="color:#7c4dff;font-size:14px;min-width:30px;">WO</b><span style="color:#555;">– Weekly Off</span>
            </span>
            <span style="display:flex;align-items:center;gap:6px;padding-left:16px;">
                <b style="color:#e03c3c;font-size:14px;min-width:30px;">A</b><span style="color:#555;">– Absent</span>
            </span>
            <span style="display:flex;align-items:center;gap:6px;padding-right:16px;border-right:1px solid #e0e4e8;">
                <b style="color:#e07b39;font-size:14px;min-width:30px;">LWP</b><span style="color:#555;">– Leave Without Pay</span>
            </span>
            <span style="display:flex;align-items:center;gap:6px;padding:0 16px;border-right:1px solid #e0e4e8;">
                <b style="color:#2490EF;font-size:14px;min-width:30px;">H</b><span style="color:#555;">– Holiday</span>
            </span>
            <span style="display:flex;align-items:center;gap:6px;padding-left:16px;">
                <b style="color:#b8860b;font-size:14px;min-width:30px;">HD</b><span style="color:#555;">– Half Day</span>
            </span>
        </div>`;

    // Try multiple possible filter section selectors
    const targets = [
        ".frappe-report-filters-section",
        ".filter-section",
        ".standard-filter-section",
        ".page-form"
    ];

    let injected = false;
    for (const sel of targets) {
        const el = wrapper.find(sel).first();
        if (el.length) {
            el.after(legend_html);
            injected = true;
            break;
        }
    }

    // Fallback: prepend to report wrapper
    if (!injected) {
        wrapper.find(".report-wrapper").prepend(legend_html);
    }
}

// ── Custom Print ──────────────────────────────────────────────────────────────

function att_custom_print(report) {
    var data    = frappe.query_report.data || [];
    var filters = frappe.query_report.get_values() || {};
    var cols    = frappe.query_report.get_columns() || [];

    var month    = filters.month    || "";
    var year     = filters.year     || "";
    var category = filters.category || "";
    var company  = (filters.company && filters.company.length)
                    ? filters.company.join(", ")
                    : (frappe.boot.sysdefaults.company || "");

    var day_cols       = cols.filter(function(c){ return c.fieldname && c.fieldname.startsWith("day_"); });
    var summary_fields = ["working_days","present_days","half_days","absent_days","weekly_off_days","holiday_days","lwp_days","absent_lwp"];
    var summary_labels = {
        working_days:    "WD",
        present_days:    "P",
        half_days:       "HD",
        absent_days:     "A",
        weekly_off_days: "WO",
        holiday_days:    "H",
        lwp_days:        "LWP",
        absent_lwp:      "A+LWP"
    };
    var float_summary = ["present_days","half_days","absent_days","absent_lwp"];

    // Colour palette — warm slate/teal, no Frappe blue
    var DAY_COLORS = {
        P:   "#1a7a4a",   // rich green
        A:   "#c0392b",   // deep red
        H:   "#1565c0",   // navy blue
        WO:  "#6a1b9a",   // deep purple
        LWP: "#bf5a00",   // burnt orange
        HD:  "#8d6e00",   // dark gold
        "-": "#c8ced4"    // muted grey
    };

    // Accent for summary header band
    var ACCENT = "#2c4a6e"; // dark navy slate

    // ── thead ──
    var thead =
        '<th class="th-id">Emp ID</th>'
      + '<th class="th-name">Employee Name</th>'
      + day_cols.map(function(c){ return '<th class="th-d">' + c.label + '</th>'; }).join("")
      + summary_fields.map(function(k){
            return '<th class="th-s">' + summary_labels[k] + '</th>';
        }).join("");

    // ── tbody ──
    var tbody = data.map(function(row, idx) {
        var is_total = !!row._is_total;

        var day_cells = day_cols.map(function(c) {
            var v   = row[c.fieldname] || "-";
            var col = DAY_COLORS[v] || DAY_COLORS["-"];
            var fw  = (v === "-") ? "400" : "700";
            return '<td class="td-d" style="color:' + col + ';font-weight:' + fw + ';">' + v + '</td>';
        }).join("");

        var sum_cells = summary_fields.map(function(k) {
            var v = (row[k] !== null && row[k] !== undefined) ? row[k] : "-";
            if (float_summary.includes(k) && v !== "-") {
                v = parseFloat(v).toFixed(2);
            }
            return '<td class="td-s">' + v + '</td>';
        }).join("");

        if (is_total) {
            return '<tr class="tr-total">'
                 + '<td class="td-id"></td>'
                 + '<td class="td-name"><strong>Total</strong></td>'
                 + day_cells + sum_cells
                 + '</tr>';
        }

        var stripe = (idx % 2 !== 0) ? ' tr-stripe' : '';
        return '<tr class="tr-body' + stripe + '">'
             + '<td class="td-id">' + (row.employee || "") + '</td>'
             + '<td class="td-name">' + (row.employee_name || "") + '</td>'
             + day_cells + sum_cells
             + '</tr>';
    }).join("");

    // ── legend items ──
    var legend_items = [
        { code:"P",   label:"Present",          color:DAY_COLORS.P   },
        { code:"A",   label:"Absent",            color:DAY_COLORS.A   },
        { code:"H",   label:"Holiday",           color:DAY_COLORS.H   },
        { code:"WO",  label:"Weekly Off",        color:DAY_COLORS.WO  },
        { code:"LWP", label:"Leave Without Pay", color:DAY_COLORS.LWP },
        { code:"HD",  label:"Half Day",          color:DAY_COLORS.HD  }
    ].map(function(l){
        return '<span class="leg-item">'
             + '<span class="leg-code" style="color:' + l.color + ';">' + l.code + '</span>'
             + '<span class="leg-sep">&ndash;</span>'
             + '<span class="leg-label">' + l.label + '</span>'
             + '</span>';
    }).join("");

    var printed_on = new Date().toLocaleDateString('en-IN', {
        day:'2-digit', month:'short', year:'numeric'
    });

    var html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Attendance Report &ndash; ${month} ${year}</title>
<style>
/* ─── Reset ─────────────────────────────────────────── */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

/* ─── Base ──────────────────────────────────────────── */
body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 7.5px;
    color: #1c1c1c;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}

.page { padding: 9mm 10mm; }

/* ─── Header ────────────────────────────────────────── */
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid ${ACCENT};
    padding-bottom: 7px;
    margin-bottom: 7px;
}
.hdr-left {}
.company { font-size: 14px; font-weight: 800; color: ${ACCENT}; text-transform: uppercase; letter-spacing: 0.5px; }
.category-tag {
    display: inline-block;
    margin-top: 3px;
    font-size: 8px;
    font-weight: 600;
    color: #fff;
    background: #4a7fa5;
    padding: 1px 7px;
    border-radius: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
}
.report-name { font-size: 10.5px; font-weight: 700; color: #333; margin-top: 4px; }
.hdr-right { text-align: right; }
.period { font-size: 11px; font-weight: 700; color: ${ACCENT}; }
.printed { font-size: 7.5px; color: #999; margin-top: 3px; }

/* ─── Legend ────────────────────────────────────────── */
.legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    padding: 5px 8px;
    margin-bottom: 7px;
    border: 1px solid #dde2e8;
    border-radius: 3px;
    background: #f8f9fb;
    align-items: center;
}
.leg-item { display: flex; align-items: center; gap: 3px; }
.leg-code { font-weight: 800; font-size: 8px; min-width: 20px; }
.leg-sep { color: #aaa; font-size: 8px; }
.leg-label { color: #444; font-size: 7.5px; }

/* ─── Table ─────────────────────────────────────────── */
table {
    border-collapse: collapse;
    width: 100%;
    font-size: 7px;
    border: 1px solid #c8cfd8;
    table-layout: auto;
}

/* Fixed columns */
.th-id   { width: 72px; text-align: left; }
.th-name { width: 110px; text-align: left; }
.td-id, .td-name { white-space: nowrap; text-align: left; }

/* Day header */
.th-d {
    padding: 5px 1px;
    font-size: 6.5px;
    font-weight: 700;
    color: #fff;
    background: ${ACCENT};
    border: 1px solid #3a5a80;
    text-align: center;
    white-space: nowrap;
    min-width: 16px;
}

/* Summary header — warm amber band */
.th-s {
    padding: 5px 2px;
    font-size: 6.5px;
    font-weight: 700;
    color: #fff;
    background: #7a5c00;
    border: 1px solid #8d6a00;
    text-align: center;
    white-space: nowrap;
    min-width: 22px;
}

/* Fixed col headers */
.th-id, .th-name {
    padding: 5px 4px;
    font-size: 7px;
    font-weight: 700;
    color: #fff;
    background: #1a3352;
    border: 1px solid #253f63;
    white-space: nowrap;
}

/* Body cells */
.tr-body td, .tr-stripe td, .tr-total td {
    border: 1px solid #e0e5ea;
    vertical-align: middle;
}
.td-id, .td-name { padding: 3.5px 4px; font-size: 7px; }
.td-d { padding: 3.5px 1px; text-align: center; font-size: 7px; }
.td-s { padding: 3.5px 3px; text-align: center; font-size: 7px; font-weight: 600; color: #2c2c2c; }

.tr-stripe { background: #f4f6f9; }

/* Total row */
.tr-total td {
    background: #e8f0f8;
    font-weight: 700;
    font-size: 7px;
    border-top: 1.5px solid ${ACCENT};
    padding: 4px 3px;
}
.tr-total .td-d { color: #555; }

/* ─── Print ──────────────────────────────────────────── */
@media print {
    @page { size: A3 landscape; margin: 7mm 8mm; }
    .page { padding: 0; }
    body { font-size: 7px; }
}
</style>
</head>
<body>
<div class="page">

    <!-- Header -->
    <div class="header">
        <div class="hdr-left">
            <div class="company">${company}</div>
            ${category ? '<div><span class="category-tag">' + category + '</span></div>' : ''}
            <div class="report-name">Monthly Attendance Report</div>
        </div>
        <div class="hdr-right">
            <div class="period">${month} &nbsp;${year}</div>
            <div class="printed">Printed on: ${printed_on}</div>
        </div>
    </div>

    <!-- Legend -->
    <div class="legend">${legend_items}</div>

    <!-- Table -->
    <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
    </table>

</div>
</body>
</html>`;

    var w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function(){ w.print(); }, 800);
}