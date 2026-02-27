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
            if (r.message) {
                ep_fix_breadcrumbs(r.message.employee || emp);
                render_profile($sidebar, $main, r.message, emp);
            }
        }
    });
};

function ep_fix_breadcrumbs(emp_name) {
    // #navbar-breadcrumbs is the native Frappe top-left <ul>
    // Frappe's own CSS already adds the ">" separator via li::before
    // We just set the <li> items — NO custom separator needed
    var $nb = $("#navbar-breadcrumbs");
    if (!$nb.length) { return; }

    $nb.html(
        "<li><a href='/app/saral-hr'>Saral HR</a></li>" +
        "<li><a href='/app/employee'>Employee</a></li>" +
        "<li>" + emp_name + "</li>"
    );
}

function inject_ep_styles() {
    if (document.getElementById("ep-styles")) return;
    var style = document.createElement("style");
    style.id = "ep-styles";
    style.innerHTML = `
        /* ── Sidebar ── */
        .ep-sidebar-inner { padding: 0 4px; }
        .ep-avatar {
            width: 96px; height: 96px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            display: flex; align-items: center; justify-content: center;
            font-size: 36px; color: #fff; font-weight: 700;
            margin: 0 auto 12px;
        }
        .ep-avatar img { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; }
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
            flex-wrap: wrap; gap: 8px;
        }
        .ep-card-title { font-size: 15px; font-weight: 600; color: var(--text-color); margin: 0; }

        /* ── Salary: borderless grid ── */
        .ep-salary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
        .ep-salary-item { padding: 14px 16px; }
        .ep-salary-item-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .ep-salary-item-val   { font-size: 15px; font-weight: 600; color: var(--text-color); }

        /* ── Year dropdown filter ── */
        .ep-year-select {
            padding: 3px 10px; border-radius: 6px;
            border: 1px solid var(--border-color, #e5e7eb);
            background: var(--card-bg, #fff); font-size: 12px;
            cursor: pointer; color: var(--text-color); outline: none;
        }
        .ep-year-select:focus { border-color: var(--blue-500, #1d4ed8); }

        /* ── Heatmap ── */
        .ep-heatmap-scroll { overflow-x: auto; padding-bottom: 6px; }
        .ep-heatmap-inner  { display: flex; align-items: flex-start; min-width: max-content; }
        .ep-month-col      { display: flex; flex-direction: column; margin-right: 8px; }
        .ep-month-label-btn {
            font-size: 10px; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.04em; margin-bottom: 4px; text-align: center;
            background: none; border: none; cursor: pointer;
            color: var(--text-muted); padding: 2px 4px; border-radius: 4px;
            width: 100%; transition: all 0.15s;
        }
        .ep-month-label-btn:hover { color: var(--blue-500, #1d4ed8); }
        .ep-month-label-btn.active { background: var(--blue-500, #1d4ed8); color: #fff; border-radius: 4px; }
        .ep-month-weeks { display: flex; gap: 2px; }
        .ep-week-col    { display: flex; flex-direction: column; gap: 2px; }
        .ep-day         { width: 11px; height: 11px; border-radius: 2px; cursor: default; flex-shrink: 0; }

        .ep-day.present   { background: var(--green-500,   #22c55e); }
        .ep-day.absent    { background: var(--red-500,     #ef4444); }
        .ep-day.halfday   { background: var(--yellow-400,  #facc15); }
        .ep-day.lwp       { background: var(--orange-500,  #f97316); }
        .ep-day.holiday   { background: var(--blue-400,    #60a5fa); }
        .ep-day.weeklyoff { background: #a855f7; }
        .ep-day.empty     { background: transparent; }
        .ep-day.future    { background: var(--gray-100,    #f3f4f6); }

        .ep-legend      { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
        .ep-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }

        /* Att summary */
        .ep-att-summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 14px; }
        .ep-att-box     { background: var(--control-bg, #f9fafb); border-radius: 6px; padding: 10px 6px; text-align: center; }
        .ep-att-val     { font-size: 18px; font-weight: 700; }
        .ep-att-label   { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

        /* ── Timeline ── */
        .ep-timeline {
            position: relative; padding-left: 40px;
            border-left: 2px solid var(--border-color, #d1d8dd);
            margin-left: 6px; padding-top: 4px;
        }
        .ep-timeline-item { position: relative; padding-bottom: 20px; }
        .ep-timeline-item:last-child { padding-bottom: 0; }
        .ep-tl-dot {
            position: absolute; left: -47px; top: 16px;
            width: 12px; height: 12px; border-radius: 50%;
            background: var(--gray-400, #adb5bd);
            border: 2px solid white;
            box-shadow: 0 0 0 2px var(--gray-400, #adb5bd);
            z-index: 1;
        }
        .ep-timeline-item.tl-active .ep-tl-dot {
            background: var(--green-500, #28a745);
            box-shadow: 0 0 0 2px var(--green-500, #28a745);
        }
        .ep-tl-card {
            background: var(--gray-50, #f8f9fa);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius, 6px);
            padding: 14px 16px; max-width: 460px;
        }
        .ep-tl-company { font-size: 14px; font-weight: 600; color: var(--text-color); margin-bottom: 6px; }
        .ep-tl-date    { font-size: 13px; color: var(--text-muted); margin-bottom: 3px; }
        .ep-tl-meta    { font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }
        .ep-tl-badge {
            display: inline-block; margin-top: 10px;
            padding: 3px 10px; font-size: 11px; font-weight: 500; border-radius: 20px;
        }
        .ep-tl-badge.active   { background: var(--green-highlight-color, #d4edda); color: var(--green-avatar-color, #155724); }
        .ep-tl-badge.inactive { background: var(--gray-100, #f1f3f4); color: var(--gray-600, #666); }
        .ep-timeline-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px; }
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

var MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function render_profile($sidebar, $main, d, emp) {
    var s = d.salary || {};
    var c = d.company_link || {};
    var att_map = d.attendance_map || {};
    var years = d.years || [];
    var timeline = d.timeline || [];

    var avatar_html = d.employee_image
        ? "<img src='" + d.employee_image + "' />"
        : (d.first_name ? d.first_name.charAt(0).toUpperCase() : "E");

    // ── SIDEBAR ──
    var sidebar = "<div class='ep-sidebar-inner'>";
    sidebar += "<div class='ep-avatar'>" + avatar_html + "</div>";
    sidebar += "<div class='ep-name'>" + (d.employee || "") + "</div>";
    sidebar += "<hr class='ep-divider'>";

    if (c.company)         sidebar += info_row("Company",     c.company);
    if (c.branch)          sidebar += info_row("Branch",      c.branch);
    if (c.category)        sidebar += info_row("Category",    c.category);
    if (c.date_of_joining) sidebar += info_row("Joined",      c.date_of_joining);
    if (c.department)      sidebar += info_row("Department",  c.department);
    if (c.designation)     sidebar += info_row("Designation", c.designation);
    if (d.tenure)          sidebar += info_row("Tenure",      d.tenure);
    if (c.immediate_reporting_name) sidebar += info_row("Immediate Reporting", c.immediate_reporting_name);
    if (c.final_reporting_name)     sidebar += info_row("Final Reporting",     c.final_reporting_name);

    sidebar += "<hr class='ep-divider'>";
    sidebar += "<a href='/app/employee/" + emp + "' class='ep-link-btn'>Edit Employee</a>";
    if (d.company_link_name) {
        sidebar += "<a href='/app/company-link/" + encodeURIComponent(d.company_link_name) + "' class='ep-link-btn'>View Company Record</a>";
    }
    sidebar += "<a href='/app/salary-structure-assignment?employee=" + encodeURIComponent(emp) + "' class='ep-link-btn'>Salary Assignment</a>";
    sidebar += "</div>";

    $sidebar.html(sidebar);

    // ── MAIN ──
    var main = "";

    main += "<div class='ep-card'>";
    main += "<div class='ep-title-area'><h4 class='ep-card-title'>Salary Overview</h4></div>";
    main += "<div class='ep-salary-grid'>";
    main += sal_item("Monthly CTC",           s.monthly_ctc);
    main += sal_item("Annual CTC",            s.annual_ctc);
    main += sal_item("Gross Salary",          s.gross_salary);
    main += sal_item("Net Salary",            s.net_salary);
    main += sal_item("Total Deductions",      s.total_deductions);
    main += sal_item("Employer Contribution", s.total_employer_contribution);
    main += "</div></div>";

    var current_year = years.length ? years[0] : new Date().getFullYear();
    main += "<div class='ep-card'>";
    main += "<div class='ep-title-area'>";
    main += "<h4 class='ep-card-title'>Attendance Overview</h4>";
    main += "<select class='ep-year-select' id='ep-year-select'>";
    years.forEach(function(yr) { main += "<option value='" + yr + "'>" + yr + "</option>"; });
    main += "</select>";
    main += "</div>";
    main += "<div id='ep-heatmap-wrap'></div>";
    main += "</div>";

    main += "<div class='ep-card'>";
    main += "<div class='ep-title-area'><h4 class='ep-card-title'>Employee Timeline</h4></div>";
    main += render_timeline_html(timeline);
    main += "</div>";

    $main.html(main);

    render_heatmap($main, att_map, current_year, "all");

    $main.find("#ep-year-select").on("change", function() {
        var yr = parseInt($(this).val());
        var active_btn = $main.find(".ep-month-label-btn.active");
        var active_month = active_btn.length ? active_btn.data("month") : "all";
        render_heatmap($main, att_map, yr, active_month);
    });

    $main.find("#ep-heatmap-wrap").on("click", ".ep-month-label-btn", function() {
        var clicked_month = $(this).data("month");
        var yr = parseInt($main.find("#ep-year-select").val());
        var is_currently_active = $(this).hasClass("active");
        render_heatmap($main, att_map, yr, is_currently_active ? "all" : clicked_month);
    });
}

function info_row(label, val) {
    return "<div class='ep-info-row'>" +
        "<div class='ep-info-label'>" + label + "</div>" +
        "<div class='ep-info-val'>" + val + "</div>" +
        "</div>";
}

function sal_item(label, val) {
    return "<div class='ep-salary-item'>" +
        "<div class='ep-salary-item-label'>" + label + "</div>" +
        "<div class='ep-salary-item-val'>&#8377;" + fmt_currency(val) + "</div>" +
        "</div>";
}

function render_timeline_html(timeline) {
    if (!timeline || !timeline.length) {
        return "<div class='ep-timeline-empty'>No timeline events found.</div>";
    }
    var html = "<div class='ep-timeline'>";
    timeline.forEach(function(item) {
        var active_cls = item.is_active == 1 ? " tl-active" : "";
        var date_html = "";
        if (item.start_date) date_html += "<div class='ep-tl-date'><strong>Start:</strong> " + item.start_date + "</div>";
        if (item.end_date)   date_html += "<div class='ep-tl-date'><strong>End:</strong> "   + item.end_date   + "</div>";
        var meta_parts = [];
        if (item.designation) meta_parts.push(item.designation);
        if (item.department)  meta_parts.push(item.department);
        if (item.branch)      meta_parts.push(item.branch);
        var meta_html = meta_parts.length ? "<div class='ep-tl-meta'>" + meta_parts.join(" &middot; ") + "</div>" : "";
        html += "<div class='ep-timeline-item" + active_cls + "'>";
        html += "<div class='ep-tl-dot'></div>";
        html += "<div class='ep-tl-card'>";
        html += "<div class='ep-tl-company'>" + (item.company || "-") + "</div>";
        html += date_html + meta_html;
        html += "</div></div>";
    });
    html += "</div>";
    return html;
}

function render_heatmap($w, att_map, year, active_month) {
    year = parseInt(year);
    active_month = active_month || "all";
    var today     = new Date();
    var today_str = today.toISOString().split("T")[0];
    var summary   = { present:0, absent:0, half_day:0, lwp:0, holiday:0, weekly_off:0 };
    var selected_month = (active_month === "all") ? null : parseInt(active_month);

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

        var is_selected = (active_month !== "all") && String(active_month) === String(month_num);
        inner += "<div class='ep-month-col'>";
        inner += "<button class='ep-month-label-btn" + (is_selected ? " active" : "") + "' data-month='" + month_num + "'>" + MONTH_NAMES[m] + "</button>";
        inner += "<div class='ep-month-weeks'>";
        weeks.forEach(function(wk) {
            inner += "<div class='ep-week-col'>";
            wk.forEach(function(d) {
                if (!d) { inner += "<div class='ep-day empty'></div>"; return; }
                var day_str = year + "-" + month_str + "-" + String(d).padStart(2, "0");
                var status  = att_map[day_str] || null;
                var cls = "ep-day ", title = day_str;
                if (day_str > today_str) {
                    cls += "future"; title += " (future)";
                } else if (status) {
                    cls += (STATUS_COLORS[status] || "future");
                    title += ": " + status;
                    if (selected_month === null || selected_month === month_num) {
                        if      (status === "Present")    summary.present++;
                        else if (status === "Absent")     summary.absent++;
                        else if (status === "Half Day")   summary.half_day++;
                        else if (status === "LWP")        summary.lwp++;
                        else if (status === "Holiday")    summary.holiday++;
                        else if (status === "Weekly Off") summary.weekly_off++;
                    }
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

    var legend_items = [
        ["present","Present"], ["absent","Absent"], ["halfday","Half Day"],
        ["lwp","LWP"], ["holiday","Holiday"], ["weeklyoff","Weekly Off"], ["future","No Record"]
    ];
    var legend = "<div class='ep-legend'>";
    legend_items.forEach(function(li) {
        legend += "<div class='ep-legend-item'><div class='ep-day " + li[0] + "' style='flex-shrink:0'></div>" + li[1] + "</div>";
    });
    legend += "</div>";

    var boxes = [
        [summary.present,    "Present",    "var(--green-500,  #22c55e)"],
        [summary.absent,     "Absent",     "var(--red-500,    #ef4444)"],
        [summary.half_day,   "Half Day",   "var(--yellow-400, #facc15)"],
        [summary.lwp,        "LWP",        "var(--orange-500, #f97316)"],
        [summary.holiday,    "Holiday",    "var(--blue-400,   #60a5fa)"],
        [summary.weekly_off, "Weekly Off", "#a855f7"]
    ];
    var summ = "<div class='ep-att-summary'>";
    boxes.forEach(function(b) {
        summ += "<div class='ep-att-box'>" +
            "<div class='ep-att-val' style='color:" + b[2] + "'>" + b[0] + "</div>" +
            "<div class='ep-att-label'>" + b[1] + "</div>" +
            "</div>";
    });
    summ += "</div>";

    $w.find("#ep-heatmap-wrap").html(inner + legend + summ);
}