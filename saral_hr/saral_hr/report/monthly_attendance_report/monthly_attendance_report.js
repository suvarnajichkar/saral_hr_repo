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
        // Inject footer-hiding CSS immediately (same pattern as Employee Timeline)
        att_inject_styles();

        frappe.after_ajax(function() {
            // Build legend using DOM (not HTML string) so dash renders correctly
            att_inject_legend_dom(report);

            // Print button
            console.log("[ATT] Setting up print button");
            report.page.set_primary_action(__("Print"), function() {
                console.log("[ATT] Print button clicked");
                att_custom_print(report);
            }, "printer");
        });
    },

    after_datatable_render: function(datatable_obj) {
        // Called by Frappe every time the table re-renders — perfect hook to kill footer
        att_hide_footer_elements();
    },

    formatter: function(value, row, column, data, default_formatter) {
        if (!data) return default_formatter(value, row, column, data);
        var fn = column.fieldname;

        if (data._is_total) {
            value = default_formatter(value, row, column, data);
            return "<strong>" + value + "</strong>";
        }

        // 2 decimal float fields
        var floatFields = ["present_days", "half_days", "absent_days", "absent_lwp"];
        if (floatFields.indexOf(fn) !== -1 && value !== null && value !== undefined && value !== "") {
            var num = parseFloat(value);
            if (!isNaN(num)) return "<span>" + num.toFixed(2) + "</span>";
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

// ── Style injection (footer hide via CSS — same approach as Employee Timeline) ──

function att_inject_styles() {
    if (document.getElementById("att-report-styles")) return;
    var style = document.createElement("style");
    style.id = "att-report-styles";
    style.textContent = [
        /* Frappe "For comparison..." footer bar and execution time line */
        ".report-summary { display:none !important; }",
        ".report-footer  { display:none !important; }",
        ".datatable-footer { display:none !important; }",
        ".dt-footer { display:none !important; }",
        ".nb-small { display:none !important; }",
        ".report-wrapper ~ .row { display:none !important; }",
        ".report-wrapper > .form-message { display:none !important; }",
        ".query-report-run-btn-wrapper { display:none !important; }"
    ].join("\n");
    document.head.appendChild(style);
}

// ── DOM-level footer kill (belt-and-suspenders, runs after each render) ──

function att_hide_footer_elements() {
    // Hide by text content match — catches whatever selector Frappe uses
    document.querySelectorAll(".form-message, .report-footer, .nb-small, .dt-footer").forEach(function(el) {
        if (el.textContent && el.textContent.indexOf("For comparison") !== -1) {
            el.style.setProperty("display", "none", "important");
        }
        // Also hide execution time sibling
        if (el.textContent && el.textContent.indexOf("Execution Time") !== -1) {
            el.style.setProperty("display", "none", "important");
        }
    });
    // Blanket hide for any .dt-footer
    document.querySelectorAll(".dt-footer").forEach(function(el) {
        el.style.setProperty("display", "none", "important");
    });
}

// ── Legend — built entirely with DOM API so dash character always renders ──

function att_inject_legend_dom(report) {
    // Remove stale legend if report re-ran
    var existing = document.querySelector(".att-legend-bar");
    if (existing) existing.remove();

    var items = [
        { code: "P",   label: "Present",          color: "#2d8a4e" },
        { code: "WO",  label: "Weekly Off",        color: "#7c4dff" },
        { code: "A",   label: "Absent",            color: "#e03c3c" },
        { code: "LWP", label: "Leave Without Pay", color: "#e07b39" },
        { code: "H",   label: "Holiday",           color: "#2490EF" },
        { code: "HD",  label: "Half Day",          color: "#b8860b" }
    ];

    // Outer grid container
    var bar = document.createElement("div");
    bar.className = "att-legend-bar";
    bar.style.cssText = [
        "display:grid",
        "grid-template-columns:repeat(3,1fr)",
        "gap:10px 0",
        "padding:12px 16px",
        "margin:8px 15px 4px 15px",
        "border-top:1px solid #e0e4e8",
        "border-bottom:1px solid #e0e4e8",
        "font-size:12px",
        "color:#333"
    ].join(";");

    items.forEach(function(item, idx) {
        var col = idx % 3;

        // Cell wrapper
        var cell = document.createElement("span");
        cell.style.cssText = "display:flex;align-items:center;gap:6px;";
        if (col === 0) cell.style.cssText += "padding-right:20px;border-right:1px solid #e0e4e8;";
        if (col === 1) cell.style.cssText += "padding:0 20px;border-right:1px solid #e0e4e8;";
        if (col === 2) cell.style.cssText += "padding-left:20px;";

        // Code badge
        var code = document.createElement("b");
        code.style.cssText = "color:" + item.color + ";font-size:13px;min-width:30px;";
        code.textContent = item.code;          // textContent — no encoding needed

        // Dash — set as textContent so it ALWAYS renders
        var dash = document.createElement("span");
        dash.style.cssText = "color:#aaa;margin:0 2px;";
        dash.textContent = "\u2013";           // en-dash via textContent, 100% reliable

        // Label
        var lbl = document.createElement("span");
        lbl.style.cssText = "color:#555;";
        lbl.textContent = item.label;

        cell.appendChild(code);
        cell.appendChild(dash);
        cell.appendChild(lbl);
        bar.appendChild(cell);
    });

    // Find insertion point — try multiple selectors like Employee Timeline does
    var wrapper = report.page.wrapper[0] || report.page.wrapper;
    var targets = [
        ".frappe-report-filters-section",
        ".filter-section",
        ".standard-filter-section",
        ".page-form"
    ];

    var anchor = null;
    for (var i = 0; i < targets.length; i++) {
        anchor = wrapper.querySelector(targets[i]);
        if (anchor) break;
    }

    if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    } else {
        var rw = wrapper.querySelector(".report-wrapper");
        if (rw) rw.insertBefore(bar, rw.firstChild);
    }
}

// ── Custom Print ──────────────────────────────────────────────────────────────

// ── Custom Print — same pattern as Salary Summary ────────────────────────────

function att_custom_print(report) {
    var data    = frappe.query_report.data || [];
    var filters = frappe.query_report.get_values() || {};
    var cols    = frappe.query_report.columns || [];

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

    var ACCENT  = "#2c4a6e";
    var AMBER   = "#7a5c00";
    var DARK_HD = "#1a3352";

    var DAY_COLORS = {
        P:   "#1a7a4a",
        A:   "#c0392b",
        H:   "#1565c0",
        WO:  "#6a1b9a",
        LWP: "#bf5a00",
        HD:  "#8d6e00",
        "-": "#c8ced4"
    };

    function th_style(bg, align, minW) {
        return "padding:5px 2px;font-size:6.5px;font-weight:700;color:#fff;"
             + "background:" + bg + ";border:1px solid rgba(0,0,0,0.18);"
             + "text-align:" + align + ";white-space:nowrap;min-width:" + minW + ";";
    }

    var thead = ""
        + '<th style="' + th_style(DARK_HD, "left",   "72px")  + '">Emp ID</th>'
        + '<th style="' + th_style(DARK_HD, "left",   "120px") + '">Employee Name</th>'
        + day_cols.map(function(c){
            return '<th style="' + th_style(ACCENT, "center", "16px") + '">' + c.label + '</th>';
          }).join("")
        + summary_fields.map(function(k){
            return '<th style="' + th_style(AMBER, "center", "26px") + '">' + summary_labels[k] + '</th>';
          }).join("");

    var FIX_TD = "padding:3.5px 4px;border:1px solid #e0e5ea;white-space:nowrap;font-size:7px;vertical-align:middle;";
    var SUM_TD = "padding:3px 3px;text-align:center;border:1px solid #e0e5ea;font-size:6.8px;font-weight:600;color:#2c2c2c;vertical-align:middle;";
    var TOT_EX = "background:#dde8f5;font-weight:700;border-top:2px solid " + ACCENT + ";";

    var tbody = data.map(function(row, idx) {
        var is_total = !!row._is_total;

        var day_cells = day_cols.map(function(c) {
            var v  = row[c.fieldname] || "-";
            var co = DAY_COLORS[v] || DAY_COLORS["-"];
            var fw = (v === "-") ? "400" : "700";
            return '<td style="padding:3px 1px;text-align:center;border:1px solid #e0e5ea;'
                 + 'font-size:6.8px;color:' + co + ';font-weight:' + fw + ';vertical-align:middle;">'
                 + v + '</td>';
        }).join("");

        var sum_cells = summary_fields.map(function(k) {
            var v = (row[k] !== null && row[k] !== undefined) ? row[k] : "-";
            if (float_summary.indexOf(k) !== -1 && v !== "-") {
                v = parseFloat(v).toFixed(2);
            }
            return '<td style="' + SUM_TD + (is_total ? TOT_EX : "") + '">' + v + '</td>';
        }).join("");

        if (is_total) {
            return '<tr>'
                 + '<td style="' + FIX_TD + TOT_EX + '"></td>'
                 + '<td style="' + FIX_TD + TOT_EX + '"><strong>Total</strong></td>'
                 + day_cells + sum_cells + '</tr>';
        }

        var rowbg = (idx % 2 !== 0) ? "#f4f6f9" : "#ffffff";
        return '<tr style="background:' + rowbg + ';">'
             + '<td style="' + FIX_TD + '">' + (row.employee      || "") + '</td>'
             + '<td style="' + FIX_TD + '">' + (row.employee_name || "") + '</td>'
             + day_cells + sum_cells + '</tr>';
    }).join("");

    // Legend
    var leg_html = [
        { code:"P",   label:"Present",          color:DAY_COLORS.P   },
        { code:"A",   label:"Absent",            color:DAY_COLORS.A   },
        { code:"H",   label:"Holiday",           color:DAY_COLORS.H   },
        { code:"WO",  label:"Weekly Off",        color:DAY_COLORS.WO  },
        { code:"LWP", label:"Leave Without Pay", color:DAY_COLORS.LWP },
        { code:"HD",  label:"Half Day",          color:DAY_COLORS.HD  }
    ].map(function(l) {
        return '<span style="display:inline-flex;align-items:center;gap:3px;">'
             + '<b style="color:' + l.color + ';font-size:8px;min-width:22px;">' + l.code + '</b>'
             + '<span style="color:#aaa;font-size:8px;">&#8211;</span>'
             + '<span style="color:#444;font-size:7.5px;">' + l.label + '</span>'
             + '</span>';
    }).join("");

    var printed_on = new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
    });

    // Build HTML — plain string concat, zero template literals
    var S = "";
    S += "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
    S += "<title>Attendance - " + month + " " + year + "</title>";
    S += "<style>";
    S += "*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }";
    S += "body { font-family:'Segoe UI',Arial,sans-serif; font-size:7.5px; color:#1c1c1c; background:#fff;";
    S += "       -webkit-print-color-adjust:exact; print-color-adjust:exact; }";
    S += ".page { padding:9mm 10mm; }";
    S += ".header { display:flex; justify-content:space-between; align-items:flex-end;";
    S += "          border-bottom:2.5px solid " + ACCENT + "; padding-bottom:8px; margin-bottom:8px; }";
    S += ".company  { font-size:14px; font-weight:800; color:" + ACCENT + "; text-transform:uppercase; letter-spacing:0.5px; }";
    S += ".cat-pill { display:inline-block; margin-top:3px; font-size:7.5px; font-weight:700; color:#fff;";
    S += "            background:#4a7fa5; padding:2px 9px; border-radius:10px; text-transform:uppercase; }";
    S += ".rpt-name { font-size:10px; font-weight:700; color:#333; margin-top:4px; }";
    S += ".period   { font-size:12px; font-weight:800; color:" + ACCENT + "; }";
    S += ".printed  { font-size:7px; color:#999; margin-top:3px; }";
    S += ".legend   { display:flex; flex-wrap:wrap; gap:4px 22px; padding:5px 10px; margin-bottom:8px;";
    S += "            border:1px solid #dde2e8; border-radius:3px; background:#f8f9fb; align-items:center; }";
    S += "table { border-collapse:collapse; width:100%; border:1px solid #c8cfd8; }";
    S += "@media print { @page { size:A3 landscape; margin:7mm 8mm; } .page { padding:0; } }";
    S += "</style></head><body><div class='page'>";
    S += "<div class='header'>";
    S += "  <div><div class='company'>" + company + "</div>";
    if (category) { S += "<div><span class='cat-pill'>" + category + "</span></div>"; }
    S += "  <div class='rpt-name'>Monthly Attendance Report</div></div>";
    S += "  <div style='text-align:right;'>";
    S += "    <div class='period'>" + month + "&nbsp;" + year + "</div>";
    S += "    <div class='printed'>Printed on: " + printed_on + "</div>";
    S += "  </div></div>";
    S += "<div class='legend'>" + leg_html + "</div>";
    S += "<table><thead><tr>" + thead + "</tr></thead><tbody>" + tbody + "</tbody></table>";
    S += "</div></body></html>";

    // Debug logging
    console.log("[ATT PRINT] Starting print...");
    console.log("[ATT PRINT] data rows:", data.length);
    console.log("[ATT PRINT] day_cols:", day_cols.length);
    console.log("[ATT PRINT] HTML length:", S.length);
    console.log("[ATT PRINT] month:", month, "year:", year, "company:", company);

    var w = window.open("", "_blank");
    console.log("[ATT PRINT] window.open result:", w);
    if (!w) {
        console.error("[ATT PRINT] BLOCKED — popup blocker prevented window.open");
        frappe.msgprint({
            title: "Print Blocked",
            message: "Your browser blocked the print popup.<br><br>"
                   + "Please allow popups for this site:<br>"
                   + "<b>Chrome:</b> Click the blocked popup icon in the address bar<br>"
                   + "<b>Firefox:</b> Click Options when the bar appears<br><br>"
                   + "Then click Print again.",
            indicator: "orange"
        });
        return;
    }
    w.document.write(S);
    w.document.close();
    w.focus();
    console.log("[ATT PRINT] document written, triggering print in 800ms");
    setTimeout(function() { w.print(); }, 800);
}