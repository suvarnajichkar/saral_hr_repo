frappe.pages["employee-profile"].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({ parent: wrapper, title: "Employee Profile" });
    inject_ep_styles();
};

frappe.pages["employee-profile"].on_page_show = function(wrapper) {
    var route = frappe.get_route();
    var emp = route[1];
    if (!emp) { return; }

    var $sidebar = $(wrapper).find(".layout-side-section");
    var $main    = $(wrapper).find(".layout-main-section");

    $main.html("<div style='padding:40px;text-align:center;color:#6b7280;'>Loading profile...</div>");

    frappe.call({
        method: "saral_hr.saral_hr.page.employee_profile.employee_profile.get_employee_profile_data",
        args: { employee: emp },
        callback: function(r) {
            if (r.message) { render_profile($sidebar, $main, r.message, emp); }
        }
    });
};

function inject_ep_styles() {
    if (document.getElementById("ep-styles")) return;
    var style = document.createElement("style");
    style.id = "ep-styles";
    style.innerHTML = `
        /* ── Sidebar ── */
        .ep-sidebar-inner { padding: 0 4px; }
        .ep-avatar {
            width: 72px; height: 72px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            display: flex; align-items: center; justify-content: center;
            font-size: 28px; color: #fff; font-weight: 700;
            margin: 0 auto 10px;
        }
        .ep-avatar img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; }
        .ep-name  { text-align: center; font-size: 16px; font-weight: 700; color: var(--text-color); margin-bottom: 2px; }
        .ep-sub   { text-align: center; font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }
        .ep-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .ep-badge.active   { background: var(--green-highlight-color, #d1fae5); color: var(--green-avatar-color, #065f46); }
        .ep-badge.inactive { background: var(--red-highlight-color, #fee2e2);   color: var(--red-avatar-color, #991b1b); }
        .ep-divider { border: none; border-top: 1px solid var(--border-color, #f3f4f6); margin: 12px 0; }

        .ep-info-row  { margin-bottom: 8px; font-size: 12px; }
        .ep-info-label { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        .ep-info-val   { color: var(--text-color); font-weight: 500; }

        .ep-link-btn {
            display: block; width: 100%; text-align: left;
            padding: 5px 0; font-size: 12px;
            color: var(--blue-500, #1d4ed8); text-decoration: none;
            background: none; border: none; cursor: pointer;
            transition: color 0.15s;
        }
        .ep-link-btn:hover { color: var(--blue-600, #1e40af); text-decoration: underline; }

        /* ── Cards ── */
        .ep-card {
            background: var(--card-bg, #fff);
            border: 1px solid var(--border-color, #f3f4f6);
            border-radius: var(--border-radius-lg, 8px);
            padding: 20px; margin-bottom: 15px;
        }
        .ep-title-area {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
        }
        .ep-card-title { font-size: 15px; font-weight: 600; color: var(--text-color); margin: 0; }

        /* ── Salary: plain bordered grid ── */
        .ep-salary-grid {
            display: grid; grid-template-columns: 1fr 1fr 1fr;
            border: 1px solid var(--border-color, #d1d8dd);
            border-radius: 6px; overflow: hidden;
        }
        .ep-salary-item {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border-color, #d1d8dd);
            border-right: 1px solid var(--border-color, #d1d8dd);
        }
        .ep-salary-item:nth-child(3n)         { border-right: none; }
        .ep-salary-item:nth-last-child(-n+3)  { border-bottom: none; }
        .ep-salary-item-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .ep-salary-item-val   { font-size: 15px; font-weight: 600; color: var(--text-color); }

        /* ── Year filter ── */
        .ep-year-filter { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .ep-year-btn {
            padding: 2px 10px; border-radius: 12px;
            border: 1px solid var(--border-color, #e5e7eb);
            background: var(--card-bg, #fff); font-size: 12px;
            cursor: pointer; color: var(--text-muted); transition: all 0.15s;
        }
        .ep-year-btn.active { background: var(--blue-500, #1d4ed8); color: #fff; border-color: var(--blue-500, #1d4ed8); }

        /* ── Heatmap — Frappe token colours, flat ── */
        .ep-heatmap-scroll { overflow-x: auto; padding-bottom: 6px; }
        .ep-heatmap-inner  { display: flex; align-items: flex-start; min-width: max-content; }
        .ep-month-col      { display: flex; flex-direction: column; margin-right: 8px; }
        .ep-month-label    { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; text-align: center; }
        .ep-month-weeks    { display: flex; gap: 2px; }
        .ep-week-col       { display: flex; flex-direction: column; gap: 2px; }
        .ep-day            { width: 11px; height: 11px; border-radius: 2px; cursor: default; flex-shrink: 0; }

        .ep-day.present    { background: var(--green-500,   #22c55e); }
        .ep-day.absent     { background: var(--red-500,     #ef4444); }
        .ep-day.halfday    { background: var(--yellow-400,  #facc15); }
        .ep-day.lwp        { background: var(--orange-500,  #f97316); }
        .ep-day.holiday    { background: var(--blue-400,    #60a5fa); }
        .ep-day.weeklyoff  { background: var(--gray-300,    #d1d5db); }
        .ep-day.empty      { background: transparent; }
        .ep-day.future     { background: var(--gray-100,    #f3f4f6); }

        .ep-legend         { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
        .ep-legend-item    { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }

        /* Att summary */
        .ep-att-summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 14px; }
        .ep-att-box     { background: var(--control-bg, #f9fafb); border-radius: 6px; padding: 10px 6px; text-align: center; }
        .ep-att-val     { font-size: 18px; font-weight: 700; }
        .ep-att-label   { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
    `;
    document.head.appendChild(style);
}

function fmt_currency(val) {
    if (!val) return "0";
    return Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

var STATUS_COLORS = {
    "Present":    "present",
    "Absent":     "absent",
    "Half Day":   "halfday",
    "LWP":        "lwp",
    "Holiday":    "holiday",
    "Weekly Off": "weeklyoff"
};

function render_profile($sidebar, $main, d, emp) {
    var s = d.salary || {};
    var c = d.company_link || {};
    var att_map = d.attendance_map || {};
    var years = d.years || [];

    var avatar_html = d.employee_image
        ? "<img src='" + d.employee_image + "' />"
        : (d.first_name ? d.first_name.charAt(0).toUpperCase() : "E");

    // ── SIDEBAR ──
    var sidebar = "<div class='ep-sidebar-inner'>";
    sidebar += "<div class='ep-avatar'>" + avatar_html + "</div>";
    sidebar += "<div class='ep-name'>" + (d.employee || "") + "</div>";

    // Designation · Department on one line (no icon)
    var sub_parts = [];
    if (c.designation) sub_parts.push(c.designation);
    if (c.department)  sub_parts.push(c.department);
    if (sub_parts.length) {
        sidebar += "<div class='ep-sub'>" + sub_parts.join(" &middot; ") + "</div>";
    }

    sidebar += "<div style='text-align:center;margin:8px 0 12px;'>";
    sidebar += "<span class='ep-badge " + (c.is_active ? "active" : "inactive") + "'>" + (c.is_active ? "Active" : "Inactive") + "</span>";
    sidebar += "</div>";

    sidebar += "<hr class='ep-divider'>";

    if (c.company)         sidebar += info_row("Company",  c.company);
    if (c.branch)          sidebar += info_row("Branch",   c.branch);
    if (c.category)        sidebar += info_row("Category", c.category);
    if (c.date_of_joining) sidebar += info_row("Joined",   c.date_of_joining);

    sidebar += "<hr class='ep-divider'>";

    sidebar += "<a href='/app/employee/" + emp + "' class='ep-link-btn'>Edit Employee</a>";

    // Company Link (previous company record form view)
    if (d.company_link_name) {
        sidebar += "<a href='/app/company-link/" + encodeURIComponent(d.company_link_name) + "' class='ep-link-btn'>View Company Record</a>";
    }

    // Employee Timeline Report
    sidebar += "<a href='/app/query-report/Employee%20Timeline%20Report?employee=" + encodeURIComponent(emp) + "' class='ep-link-btn'>Employee Timeline</a>";
    sidebar += "<a href='/app/salary-structure-assignment?employee=" + encodeURIComponent(emp) + "' class='ep-link-btn'>Salary Assignment</a>";
    sidebar += "<a href='/app/attendance?employee=" + encodeURIComponent(emp) + "' class='ep-link-btn'>Attendance Records</a>";
    sidebar += "</div>";

    $sidebar.html(sidebar);

    // ── MAIN ──
    var main = "";

    // Salary — plain bordered grid
    main += "<div class='ep-card'>";
    main += "<div class='ep-title-area'><h4 class='ep-card-title'>Salary Overview</h4></div>";
    main += "<div class='ep-salary-grid'>";
    main += sal_item(false, "Monthly CTC",           s.monthly_ctc);
    main += sal_item(false, "Annual CTC",            s.annual_ctc);
    main += sal_item(false, "Gross Salary",           s.gross_salary);
    main += sal_item(false, "Net Salary",             s.net_salary);
    main += sal_item(false, "Total Deductions",       s.total_deductions);
    main += sal_item(false, "Employer Contribution",  s.total_employer_contribution);
    main += "</div></div>";
    // Note: 6 items in a 3-col grid = 2 rows

    // Attendance
    main += "<div class='ep-card'>";
    main += "<div class='ep-title-area'>";
    main += "<h4 class='ep-card-title'>Attendance Overview</h4>";
    main += "<div class='ep-year-filter' id='ep-year-filter'>";
    years.forEach(function(yr, i) {
        main += "<button class='ep-year-btn" + (i === 0 ? " active" : "") + "' data-year='" + yr + "'>" + yr + "</button>";
    });
    main += "</div></div>";
    main += "<div id='ep-heatmap-wrap'></div>";
    main += "</div>";

    $main.html(main);

    if (years.length) render_heatmap($main, att_map, years[0]);

    $main.find("#ep-year-filter").on("click", ".ep-year-btn", function() {
        $main.find(".ep-year-btn").removeClass("active");
        $(this).addClass("active");
        render_heatmap($main, att_map, parseInt($(this).data("year")));
    });
}

function info_row(label, val) {
    return "<div class='ep-info-row'>" +
        "<div class='ep-info-label'>" + label + "</div>" +
        "<div class='ep-info-val'>" + val + "</div>" +
        "</div>";
}

function sal_item(highlight, label, val) {
    return "<div class='ep-salary-item" + (highlight ? " highlight" : "") + "'>" +
        "<div class='ep-salary-item-label'>" + label + "</div>" +
        "<div class='ep-salary-item-val'>&#8377;" + fmt_currency(val) + "</div>" +
        "</div>";
}

function render_heatmap($w, att_map, year) {
    year = parseInt(year);
    var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var today_str = new Date().toISOString().split("T")[0];
    var summary = {present:0, absent:0, half_day:0, lwp:0, holiday:0, weekly_off:0};

    var inner = "<div class='ep-heatmap-scroll'><div class='ep-heatmap-inner'>";

    for (var m = 0; m < 12; m++) {
        var month_num = m + 1;
        var month_str = String(month_num).padStart(2, "0");
        var days_in_month = new Date(year, month_num, 0).getDate();
        var first_dow = new Date(year, m, 1).getDay();

        var weeks = [], week = [];
        for (var p = 0; p < first_dow; p++) week.push(null);
        for (var day = 1; day <= days_in_month; day++) {
            week.push(day);
            if (week.length === 7) { weeks.push(week); week = []; }
        }
        if (week.length) {
            while (week.length < 7) week.push(null);
            weeks.push(week);
        }

        inner += "<div class='ep-month-col'>";
        inner += "<div class='ep-month-label'>" + MONTHS[m] + "</div>";
        inner += "<div class='ep-month-weeks'>";
        weeks.forEach(function(wk) {
            inner += "<div class='ep-week-col'>";
            wk.forEach(function(d) {
                if (!d) { inner += "<div class='ep-day empty'></div>"; return; }
                var day_str = year + "-" + month_str + "-" + String(d).padStart(2,"0");
                var status  = att_map[day_str] || null;
                var cls = "ep-day ";
                var title = day_str;
                if (day_str > today_str) {
                    cls += "future"; title += " (future)";
                } else if (status) {
                    cls += (STATUS_COLORS[status] || "future");
                    title += ": " + status;
                    if      (status === "Present")    summary.present++;
                    else if (status === "Absent")     summary.absent++;
                    else if (status === "Half Day")   summary.half_day++;
                    else if (status === "LWP")        summary.lwp++;
                    else if (status === "Holiday")    summary.holiday++;
                    else if (status === "Weekly Off") summary.weekly_off++;
                } else {
                    cls += "future"; title += " (no record)";
                }
                inner += "<div class='" + cls + "' title='" + title + "'></div>";
            });
            inner += "</div>";
        });
        inner += "</div></div>";
    }
    inner += "</div></div>";

    // Legend uses same CSS class as heatmap dots — no inline colour needed
    var legend_items = [
        ["present",   "Present"],
        ["absent",    "Absent"],
        ["halfday",   "Half Day"],
        ["lwp",       "LWP"],
        ["holiday",   "Holiday"],
        ["weeklyoff", "Weekly Off"],
        ["future",    "No Record"],
    ];
    var legend = "<div class='ep-legend'>";
    legend_items.forEach(function(li) {
        legend += "<div class='ep-legend-item'><div class='ep-day " + li[0] + "' style='flex-shrink:0;'></div>" + li[1] + "</div>";
    });
    legend += "</div>";

    var boxes = [
        [summary.present,    "Present",    "var(--green-500,  #22c55e)"],
        [summary.absent,     "Absent",     "var(--red-500,    #ef4444)"],
        [summary.half_day,   "Half Day",   "var(--yellow-400, #facc15)"],
        [summary.lwp,        "LWP",        "var(--orange-500, #f97316)"],
        [summary.holiday,    "Holiday",    "var(--blue-400,   #60a5fa)"],
        [summary.weekly_off, "Weekly Off", "var(--gray-400,   #9ca3af)"],
    ];
    var summ = "<div class='ep-att-summary'>";
    boxes.forEach(function(b) {
        summ += "<div class='ep-att-box'>" +
            "<div class='ep-att-val' style='color:" + b[2] + ";'>" + b[0] + "</div>" +
            "<div class='ep-att-label'>" + b[1] + "</div>" +
            "</div>";
    });
    summ += "</div>";

    $w.find("#ep-heatmap-wrap").html(inner + legend + summ);
}