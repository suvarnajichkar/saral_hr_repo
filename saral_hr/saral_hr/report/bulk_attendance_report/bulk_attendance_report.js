// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Bulk Attendance Report"] = {
    filters: [
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee",
            reqd: 0
        },
        {
            fieldname: "month",
            label: __("Month"),
            fieldtype: "Select",
            options: [
                "", "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ].join("\n"),
            reqd: 0
        },
        {
            fieldname: "year",
            label: __("Year"),
            fieldtype: "Select",
            options: ["", "2024", "2025", "2026", "2027"].join("\n"),
            default: String(new Date().getFullYear()),
            reqd: 0
        }
    ],

    onload(report) {
        // Hide the default Frappe datatable area, we render our own UI
        report.page.add_inner_button(__("Save Attendance"), () => {
            BulkAttendance.saveAttendance();
        });

        report.page.add_inner_button(__("View Attendance Docs"), () => {
            frappe.set_route("List", "Attendance");
        });

        // Inject custom HTML container below the filter bar
        const $wrapper = $(report.page.main);
        $wrapper.find(".frappe-card").hide(); // hide default report card

        BulkAttendance.init(report);
    },

    after_datatable_render(report) {
        // Keep default table hidden; we use our own
        $(report.wrapper).find(".dt-wrapper").hide();
    },

    get_datatable_options(options) {
        return Object.assign(options, { skip_render: true });
    }
};

// ─── Main Controller ──────────────────────────────────────────────────────────
const BulkAttendance = {
    report: null,
    employees: [],
    filteredEmployees: [],
    selectedEmployee: null,
    employeeCompanyMap: {},
    employeeCLMap: {},
    employeeWeeklyOffMap: {},
    attendanceTableData: {},
    originalAttendanceData: {},
    holidayDates: {},
    yearAttendanceData: {},
    yearHolidayData: {},
    calendarYear: new Date().getFullYear(),
    searchDebounce: null,
    selectedIndex: -1,

    // ─── Init ────────────────────────────────────────────────────────
    init(report) {
        this.report = report;
        this.injectUI();
        this.bindEvents();
        this.loadEmployees();
    },

    injectUI() {
        const $main = $(this.report.page.main);

        // Remove any previous injection
        $main.find("#bulk-attendance-app").remove();

        const html = `
        <div id="bulk-attendance-app" style="padding: 16px 0;">
            <!-- Toolbar row -->
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px; align-items:flex-end;">
                <!-- Employee Search -->
                <div style="flex:1; min-width:220px;">
                    <label class="control-label" style="font-size:11px; color:#8d99a6;">Employee</label>
                    <div style="position:relative;">
                        <input type="text" id="ba-emp-search" class="form-control"
                            placeholder="Search employee…" autocomplete="off"
                            style="padding-right:32px;" />
                        <button id="ba-emp-clear" style="
                            display:none; position:absolute; right:8px; top:50%;
                            transform:translateY(-50%); background:#aaa; border:none;
                            color:#fff; border-radius:50%; width:18px; height:18px;
                            font-size:11px; cursor:pointer; line-height:1; padding:0;">✕</button>
                        <div id="ba-emp-dropdown" style="
                            display:none; position:absolute; top:100%; left:0; right:0;
                            background:#fff; border:1px solid #d1d8dd; border-top:none;
                            border-radius:0 0 4px 4px; max-height:260px; overflow-y:auto;
                            z-index:1100; box-shadow:0 4px 10px rgba(0,0,0,.1);"></div>
                    </div>
                </div>

                <!-- Company (readonly) -->
                <div style="flex:1; min-width:160px;">
                    <label class="control-label" style="font-size:11px; color:#8d99a6;">Company</label>
                    <input type="text" id="ba-company" class="form-control" readonly
                        style="background:#f8f9fa; color:#555;" />
                </div>

                <!-- Weekly Off (readonly) -->
                <div style="flex:1; min-width:140px;">
                    <label class="control-label" style="font-size:11px; color:#8d99a6;">Weekly Off</label>
                    <input type="text" id="ba-weekly-off" class="form-control" readonly
                        style="background:#f8f9fa; color:#555;" />
                </div>

                <!-- Month -->
                <div style="width:140px;">
                    <label class="control-label" style="font-size:11px; color:#8d99a6;">Month</label>
                    <select id="ba-month" class="form-control">
                        <option value="">Month</option>
                        ${["January","February","March","April","May","June",
                           "July","August","September","October","November","December"]
                          .map((m, i) => `<option value="${i}">${m}</option>`).join("")}
                    </select>
                </div>

                <!-- Year -->
                <div style="width:110px;">
                    <label class="control-label" style="font-size:11px; color:#8d99a6;">Year</label>
                    <select id="ba-year" class="form-control">
                        <option value="">Year</option>
                        ${[2024, 2025, 2026, 2027].map(y =>
                            `<option value="${y}" ${y === new Date().getFullYear() ? "selected" : ""}>${y}</option>`
                        ).join("")}
                    </select>
                </div>
            </div>

            <!-- Bulk-mark row -->
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                <span style="font-size:13px; color:#6c757d;">Mark remaining days as:</span>
                <button class="btn btn-default btn-xs ba-bulk" data-status="Present">Present</button>
                <button class="btn btn-default btn-xs ba-bulk" data-status="Absent">Absent</button>
                <button class="btn btn-default btn-xs ba-bulk" data-status="Half Day">Half Day</button>
                <button class="btn btn-default btn-xs ba-bulk" data-status="LWP">LWP</button>
                <div style="margin-left:auto;">
                    <button id="ba-cal-btn" class="btn btn-default btn-xs">
                        📅 Yearly Calendar
                    </button>
                </div>
            </div>

            <!-- Counts row -->
            <div id="ba-counts" style="display:none; gap:16px; flex-wrap:wrap; margin-bottom:10px; font-size:13px;">
                <span>Present: <strong id="ba-cnt-present">0</strong></span>
                <span>Absent: <strong id="ba-cnt-absent">0</strong></span>
                <span>Half Day: <strong id="ba-cnt-halfday">0</strong></span>
                <span>LWP: <strong id="ba-cnt-lwp">0</strong></span>
                <span>Weekly Off: <strong id="ba-cnt-wo">0</strong></span>
                <span>Holiday: <strong id="ba-cnt-hol">0</strong></span>
            </div>

            <!-- Attendance Table -->
            <div id="ba-table-wrap" style="display:none; max-height:520px; overflow-y:auto; border:1px solid #d1d8dd; border-radius:4px;">
                <table class="table table-bordered" style="margin:0; border-collapse:separate; border-spacing:0;">
                    <thead>
                        <tr style="background:#f7f7f7; position:sticky; top:0; z-index:10;">
                            <th style="width:110px;">Day</th>
                            <th style="width:160px;">Date</th>
                            <th style="width:90px; text-align:center;">Override<br>Weekly Off</th>
                            <th style="text-align:center;">Present</th>
                            <th style="text-align:center;">Absent</th>
                            <th style="text-align:center;">Half Day</th>
                            <th style="text-align:center;">LWP</th>
                        </tr>
                    </thead>
                    <tbody id="ba-tbody"></tbody>
                </table>
            </div>

            <!-- Calendar Modal -->
            <div id="ba-cal-modal" style="
                display:none; position:fixed; inset:0; z-index:2000;
                background:rgba(0,0,0,.55); backdrop-filter:blur(3px);
                align-items:center; justify-content:center;">
                <div style="background:#fff; border-radius:12px; width:92%; max-width:660px;
                    max-height:88vh; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.3);">
                    <div style="display:flex; justify-content:space-between; align-items:center;
                        padding:14px 20px; background:linear-gradient(135deg,#2d2d2d,#3d3d3d);">
                        <h4 style="margin:0; color:#fff; font-size:17px;">Yearly Attendance Overview</h4>
                        <button id="ba-cal-close" style="background:rgba(255,255,255,.2); border:none;
                            color:#fff; width:30px; height:30px; border-radius:50%; font-size:18px;
                            cursor:pointer;">✕</button>
                    </div>
                    <div style="padding:16px; overflow-y:auto; max-height:calc(88vh - 60px);">
                        <div style="display:flex; align-items:center; justify-content:center; gap:20px; margin-bottom:16px;">
                            <button id="ba-cal-prev" class="btn btn-default btn-xs">‹</button>
                            <strong id="ba-cal-year" style="font-size:22px;"></strong>
                            <button id="ba-cal-next" class="btn btn-default btn-xs">›</button>
                        </div>
                        <!-- Legend -->
                        <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center; margin-bottom:16px; font-size:12px;">
                            ${[
                                ["#98eeb8","Present"],["#e49797","Absent"],
                                ["rgb(238,225,105)","Half Day"],["#9c27b0","LWP"],
                                ["#ff9800","Holiday"],["#93c5fd","Weekly Off"]
                            ].map(([c,l]) => `
                                <span style="display:flex;align-items:center;gap:5px;">
                                    <span style="width:13px;height:13px;border-radius:3px;background:${c};display:inline-block;"></span>${l}
                                </span>`).join("")}
                        </div>
                        <div id="ba-cal-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;"></div>
                    </div>
                </div>
            </div>
        </div>`;

        $main.append(html);
        this.addTableStyles();
    },

    addTableStyles() {
        if (document.getElementById("ba-styles")) return;
        const style = document.createElement("style");
        style.id = "ba-styles";
        style.textContent = `
            #bulk-attendance-app table th {
                background:#f7f7f7 !important;
                position:sticky; top:0; z-index:10;
                font-size:12px;
            }
            #bulk-attendance-app table td, #bulk-attendance-app table th {
                border:1px solid #d1d8dd !important;
                padding:6px 10px;
                font-size:13px;
                vertical-align:middle;
            }
            .ba-holiday-row td { background:#fff3e0 !important; color:#e65100 !important; font-weight:500; }
            .ba-wo-row td { background:#f5f5f5 !important; color:#666 !important; }
            .ba-future-row { opacity:.45; }
            .ba-future-row td { background:#f9f9f9 !important; color:#999 !important; }
            .ba-emp-item { padding:10px 14px; cursor:pointer; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .ba-emp-item:hover { background:#f4f5f6; }
            .ba-emp-item .ba-emp-name { font-weight:500; }
            .ba-emp-item .ba-emp-id { font-size:11px; color:#888; }
            .ba-highlight { font-weight:700; }
            /* Toggle */
            .ba-toggle { position:relative; display:inline-block; width:44px; height:24px; }
            .ba-toggle input { opacity:0; width:0; height:0; }
            .ba-slider {
                position:absolute; cursor:pointer; inset:0;
                background:#ccc; border-radius:24px; transition:.3s; border:1px solid #bbb;
            }
            .ba-slider:before {
                content:""; position:absolute; height:18px; width:18px;
                left:2px; bottom:2px; background:#fff; border-radius:50%; transition:.3s;
            }
            .ba-toggle input:checked + .ba-slider { background:#2d2d2d; border-color:#2d2d2d; }
            .ba-toggle input:checked + .ba-slider:before { transform:translateX(20px); }
        `;
        document.head.appendChild(style);
    },

    // ─── Load Employees ──────────────────────────────────────────────
    loadEmployees() {
        frappe.call({
            method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.get_active_employees",
            callback: (r) => {
                if (!r.message) return;
                this.employees = r.message.map(row => ({
                    value: row.employee,
                    clId: row.name,
                    name: row.full_name + (row.aadhaar_number ? ` (${row.aadhaar_number})` : ""),
                    company: row.company,
                    weeklyOff: row.weekly_off
                        ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                        : []
                }));

                this.employees.forEach(e => {
                    this.employeeCompanyMap[e.value] = e.company;
                    this.employeeCLMap[e.value] = e.clId;
                    this.employeeWeeklyOffMap[e.value] = e.weeklyOff;
                });
            }
        });
    },

    // ─── Bind Events ─────────────────────────────────────────────────
    bindEvents() {
        const $ = window.$;

        // Employee search
        $("#ba-emp-search").on("focus", () => this.showDropdown(""));
        $("#ba-emp-search").on("input", (e) => {
            const v = e.target.value;
            $("#ba-emp-clear").toggle(v.length > 0);
            this.handleSearch(v.trim());
        });
        $("#ba-emp-search").on("keydown", (e) => this.handleSearchKeydown(e));
        $("#ba-emp-clear").on("click", () => this.clearEmployee());

        document.addEventListener("click", (e) => {
            if (!e.target.closest("#ba-emp-search, #ba-emp-dropdown, #ba-emp-clear")) {
                $("#ba-emp-dropdown").hide();
            }
        });

        // Month / Year
        $("#ba-month, #ba-year").on("change", () => this.generateTable());

        // Bulk mark
        $(".ba-bulk").on("click", (e) => {
            this.bulkMark($(e.target).data("status"));
        });

        // Calendar
        $("#ba-cal-btn").on("click", () => this.openCalendar());
        $("#ba-cal-close").on("click", () => this.closeCalendar());
        $("#ba-cal-modal").on("click", (e) => {
            if (e.target.id === "ba-cal-modal") this.closeCalendar();
        });
        $("#ba-cal-prev").on("click", () => { this.calendarYear--; this.loadYearCalendar(); });
        $("#ba-cal-next").on("click", () => { this.calendarYear++; this.loadYearCalendar(); });

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.closeCalendar();
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                this.saveAttendance();
            }
        });
    },

    // ─── Employee Search ─────────────────────────────────────────────
    handleSearch(term) {
        const local = this.localSearch(term);
        this.filteredEmployees = local;
        this.showDropdown(term, local);

        clearTimeout(this.searchDebounce);
        if (term.length >= 2) {
            this.searchDebounce = setTimeout(() => {
                frappe.call({
                    method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.search_employees",
                    args: { query: term },
                    freeze: false,
                    callback: (r) => {
                        const api = (r.message || []).map(row => ({
                            value: row.employee,
                            clId: row.name,
                            name: row.full_name,
                            company: row.company,
                            weeklyOff: row.weekly_off
                                ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                                : []
                        }));
                        const merged = this.mergeResults(local, api);
                        this.filteredEmployees = merged;
                        this.showDropdown(term, merged);
                    }
                });
            }, 300);
        }
    },

    localSearch(term) {
        if (!term) return this.employees;
        const l = term.toLowerCase();
        return this.employees.filter(e =>
            e.name.toLowerCase().includes(l) || e.value.toLowerCase().includes(l)
        );
    },

    mergeResults(local, api) {
        const seen = new Set();
        const out = [];
        for (const e of [...api, ...local]) {
            if (!seen.has(e.value)) { seen.add(e.value); out.push(e); }
        }
        return out;
    },

    highlight(text, term) {
        if (!term) return frappe.utils.escape_html(text);
        const safe = frappe.utils.escape_html(text);
        const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return safe.replace(new RegExp(`(${esc})`, "gi"), '<span class="ba-highlight">$1</span>');
    },

    showDropdown(term, results) {
        results = results !== undefined ? results : this.localSearch(term);
        const $dd = $("#ba-emp-dropdown");
        if (!results.length) {
            $dd.html('<div style="padding:12px;color:#6c757d;text-align:center;font-size:13px;">No employees found</div>').show();
            return;
        }
        $dd.html(results.map((e, i) => `
            <div class="ba-emp-item" data-idx="${i}">
                <div class="ba-emp-name">${this.highlight(e.name, term)}</div>
                <div class="ba-emp-id">${this.highlight(e.value, term)}</div>
            </div>`).join("")).show();

        $dd.find(".ba-emp-item").on("click", (ev) => {
            const idx = $(ev.currentTarget).data("idx");
            this.selectEmployee(this.filteredEmployees[idx]);
        }).on("mouseenter", (ev) => {
            this.selectedIndex = parseInt($(ev.currentTarget).data("idx"));
            this.highlightDropdownItem();
        });
        this.selectedIndex = -1;
    },

    highlightDropdownItem() {
        $("#ba-emp-dropdown .ba-emp-item").each((i, el) => {
            $(el).toggleClass("selected", i === this.selectedIndex)
                 .css("background", i === this.selectedIndex ? "#e8f0fe" : "");
        });
    },

    handleSearchKeydown(e) {
        const $dd = $("#ba-emp-dropdown");
        if (!$dd.is(":visible")) return;
        const len = this.filteredEmployees.length;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % len;
            this.highlightDropdownItem();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + len) % len;
            this.highlightDropdownItem();
        } else if (e.key === "Enter" && this.selectedIndex >= 0) {
            e.preventDefault();
            this.selectEmployee(this.filteredEmployees[this.selectedIndex]);
        } else if (e.key === "Escape") {
            $dd.hide();
        }
    },

    selectEmployee(emp) {
        this.selectedEmployee = emp;
        $("#ba-emp-search").val(emp.name);
        $("#ba-emp-clear").show();
        $("#ba-emp-dropdown").hide();
        this.selectedIndex = -1;

        // Update maps in case API result has fresh data
        if (emp.company) this.employeeCompanyMap[emp.value] = emp.company;
        if (emp.weeklyOff) this.employeeWeeklyOffMap[emp.value] = emp.weeklyOff;
        if (emp.clId) this.employeeCLMap[emp.value] = emp.clId;

        $("#ba-company").val(this.employeeCompanyMap[emp.value] || "");
        $("#ba-weekly-off").val(
            (this.employeeWeeklyOffMap[emp.value] || [])
                .map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
        );

        this.generateTable();
    },

    clearEmployee() {
        this.selectedEmployee = null;
        $("#ba-emp-search").val("");
        $("#ba-emp-clear").hide();
        $("#ba-emp-dropdown").hide();
        $("#ba-company, #ba-weekly-off").val("");
        $("#ba-table-wrap").hide();
        $("#ba-counts").hide();
        this.attendanceTableData = {};
        this.originalAttendanceData = {};
        clearTimeout(this.searchDebounce);
    },

    // ─── Table Generation ────────────────────────────────────────────
    generateTable() {
        const emp = this.selectedEmployee;
        const month = $("#ba-month").val();
        const year = $("#ba-year").val();
        if (!emp || month === "" || !year) return;

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        const startDate = `${yearNum}-${String(monthNum + 1).padStart(2, "0")}-01`;
        const lastDayDate = new Date(yearNum, monthNum + 1, 0).getDate();
        const endDate = `${yearNum}-${String(monthNum + 1).padStart(2, "0")}-${String(lastDayDate).padStart(2, "0")}`;

        const clId = this.employeeCLMap[emp.value];
        const company = this.employeeCompanyMap[emp.value];
        const weeklyOffDays = this.employeeWeeklyOffMap[emp.value] || [];

        const $tbody = $("#ba-tbody");
        const $wrap = $("#ba-table-wrap");
        $wrap.show();
        $tbody.css("opacity", "0.5");

        frappe.call({
            method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.get_holidays_between_dates",
            args: { company, start_date: startDate, end_date: endDate },
            callback: (hr) => {
                this.holidayDates = {};
                (hr.message || []).forEach(h => { this.holidayDates[h] = true; });

                frappe.call({
                    method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.get_attendance_between_dates",
                    args: { employee: clId, start_date: startDate, end_date: endDate },
                    callback: (ar) => {
                        const attendanceMap = ar.message || {};
                        this.attendanceTableData = {};
                        this.originalAttendanceData = {};
                        $tbody.empty();

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        let cur = new Date(startDate);
                        const end = new Date(endDate);

                        while (cur <= end) {
                            const d = new Date(cur);
                            d.setHours(0, 0, 0, 0);
                            const dateKey = this.fmtDate(d);
                            const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
                            const isWO = weeklyOffDays.includes(dayName.toLowerCase());
                            const isHol = !!this.holidayDates[dateKey];
                            const isFuture = d > today;

                            let status = attendanceMap[dateKey] || "";
                            if (!status) {
                                if (isHol) status = "Holiday";
                                else if (isWO) status = "Weekly Off";
                            }

                            this.attendanceTableData[dateKey] = status;
                            if (status) this.originalAttendanceData[dateKey] = status;

                            const disableRadios = isWO || isHol || (status === "Weekly Off") || (status === "Holiday") || isFuture;
                            const toggleChecked = disableRadios;

                            const row = document.createElement("tr");
                            if (isHol || status === "Holiday") row.classList.add("ba-holiday-row");
                            else if (isWO || status === "Weekly Off") row.classList.add("ba-wo-row");
                            if (isFuture) row.classList.add("ba-future-row");

                            const toggleCell = !isFuture ? `
                                <td style="text-align:center; padding:6px;">
                                    <label class="ba-toggle">
                                        <input type="checkbox" class="ba-wo-toggle" data-date="${dateKey}" ${toggleChecked ? "checked" : ""}>
                                        <span class="ba-slider"></span>
                                    </label>
                                </td>` : `<td style="text-align:center;">—</td>`;

                            row.innerHTML = `
                                <td>${dayName}</td>
                                <td>${d.getDate()} ${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()}</td>
                                ${toggleCell}
                                ${["Present","Absent","Half Day","LWP"].map(s => `
                                    <td style="text-align:center;">
                                        <input type="radio" name="ba_status_${dateKey}" value="${s}"
                                            ${status === s ? "checked" : ""}
                                            ${disableRadios ? "disabled" : ""}>
                                    </td>`).join("")}
                            `;

                            if (!isFuture) {
                                const toggle = row.querySelector(".ba-wo-toggle");
                                if (toggle) {
                                    toggle.addEventListener("change", (e) => {
                                        const checked = e.target.checked;
                                        const radios = row.querySelectorAll(`input[name="ba_status_${dateKey}"]`);
                                        if (checked) {
                                            const h = this.holidayDates[dateKey];
                                            this.attendanceTableData[dateKey] = h ? "Holiday" : "Weekly Off";
                                            row.className = h ? "ba-holiday-row" : "ba-wo-row";
                                            radios.forEach(r => { r.disabled = true; r.checked = false; });
                                        } else {
                                            row.className = "";
                                            radios.forEach(r => { r.disabled = false; });
                                            this.attendanceTableData[dateKey] = "";
                                        }
                                        this.updateCounts();
                                    });
                                }
                            }

                            if (!isFuture && !disableRadios) {
                                row.querySelectorAll("input[type='radio']").forEach(r => {
                                    r.addEventListener("change", () => {
                                        this.attendanceTableData[dateKey] = r.value;
                                        this.updateCounts();
                                    });
                                });
                            }

                            $tbody.append(row);
                            cur.setDate(cur.getDate() + 1);
                        }

                        $tbody.css("opacity", "1");
                        $("#ba-counts").css("display", "flex");
                        this.updateCounts();
                    }
                });
            }
        });
    },

    fmtDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },

    updateCounts() {
        let p = 0, a = 0, h = 0, lwp = 0, wo = 0, hol = 0;
        Object.values(this.attendanceTableData).forEach(s => {
            if (s === "Present") p++;
            else if (s === "Absent") a++;
            else if (s === "Half Day") h++;
            else if (s === "LWP") lwp++;
            else if (s === "Weekly Off") wo++;
            else if (s === "Holiday") hol++;
        });
        $("#ba-cnt-present").text(p);
        $("#ba-cnt-absent").text(a);
        $("#ba-cnt-halfday").text(h);
        $("#ba-cnt-lwp").text(lwp);
        $("#ba-cnt-wo").text(wo);
        $("#ba-cnt-hol").text(hol);
    },

    bulkMark(status) {
        Object.keys(this.attendanceTableData).forEach(date => {
            if (this.originalAttendanceData[date]) return;
            const cur = this.attendanceTableData[date];
            if (cur === "Weekly Off" || cur === "Holiday") return;

            const radios = document.querySelectorAll(`input[name="ba_status_${date}"]`);
            if (!radios.length || radios[0].disabled) return;

            radios.forEach(r => r.checked = (r.value === status));
            this.attendanceTableData[date] = status;
        });
        this.updateCounts();
    },

    // ─── Save ─────────────────────────────────────────────────────────
    saveAttendance() {
        const emp = this.selectedEmployee;
        if (!emp) {
            frappe.show_alert({ message: "Please select an employee first", indicator: "orange" });
            return;
        }

        const clId = this.employeeCLMap[emp.value];
        const records = Object.entries(this.attendanceTableData)
            .filter(([, s]) => s && s.trim())
            .map(([date, status]) => ({ employee: clId, attendance_date: date, status }));

        if (!records.length) {
            frappe.show_alert({ message: "No attendance to save", indicator: "orange" });
            return;
        }

        const scrollTop = $("#ba-table-wrap").scrollTop();

        frappe.call({
            method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.save_attendance_batch",
            args: { attendance_data: records },
            callback: (r) => {
                if (r.message && r.message.success) {
                    frappe.show_alert({ message: `Saved ${r.message.saved_count} records successfully`, indicator: "green" });
                    setTimeout(() => {
                        this.generateTable();
                        setTimeout(() => $("#ba-table-wrap").scrollTop(scrollTop), 150);
                    }, 300);
                } else {
                    frappe.show_alert({ message: r.message?.error || "Error saving attendance", indicator: "red" });
                }
            }
        });
    },

    // ─── Calendar Modal ───────────────────────────────────────────────
    openCalendar() {
        const emp = this.selectedEmployee;
        if (!emp) {
            frappe.show_alert({ message: "Please select an employee first", indicator: "orange" });
            return;
        }
        this.calendarYear = parseInt($("#ba-year").val()) || new Date().getFullYear();
        $("#ba-cal-year").text(this.calendarYear);
        $("#ba-cal-modal").css("display", "flex");
        this.loadYearCalendar();
    },

    closeCalendar() {
        $("#ba-cal-modal").hide();
    },

    loadYearCalendar() {
        $("#ba-cal-year").text(this.calendarYear);
        const emp = this.selectedEmployee;
        if (!emp) return;

        const clId = this.employeeCLMap[emp.value];
        const company = this.employeeCompanyMap[emp.value];
        const startDate = `${this.calendarYear}-01-01`;
        const endDate = `${this.calendarYear}-12-31`;

        frappe.call({
            method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.get_holidays_between_dates",
            args: { company, start_date: startDate, end_date: endDate },
            callback: (hr) => {
                this.yearHolidayData = {};
                (hr.message || []).forEach(h => { this.yearHolidayData[h] = true; });

                frappe.call({
                    method: "saral_hr.report.bulk_attendance_report.bulk_attendance_report.get_attendance_between_dates",
                    args: { employee: clId, start_date: startDate, end_date: endDate },
                    callback: (ar) => {
                        this.yearAttendanceData = ar.message || {};
                        this.renderCalendarGrid();
                    }
                });
            }
        });
    },

    renderCalendarGrid() {
        const emp = this.selectedEmployee;
        const weeklyOff = emp ? (this.employeeWeeklyOffMap[emp.value] || []) : [];
        const monthNames = ["January","February","March","April","May","June",
                            "July","August","September","October","November","December"];
        const dayLetters = ["S","M","T","W","T","F","S"];
        const today = new Date();

        const $grid = $("#ba-cal-grid");
        $grid.empty();

        monthNames.forEach((mName, mIdx) => {
            const firstDay = new Date(this.calendarYear, mIdx, 1);
            const daysInMonth = new Date(this.calendarYear, mIdx + 1, 0).getDate();
            const startOffset = firstDay.getDay();

            let html = `<div style="background:#fff; border:2px solid #e5e7eb; border-radius:8px; padding:10px; cursor:pointer;"
                onclick="BulkAttendance.selectCalendarMonth(${mIdx})">
                <div style="font-size:14px; font-weight:600; margin-bottom:8px;">${mName}</div>
                <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:1px;">`;

            dayLetters.forEach(d => {
                html += `<div style="font-size:9px; font-weight:600; color:#6b7280; text-align:center;">${d}</div>`;
            });

            for (let i = 0; i < startOffset; i++) {
                html += `<div></div>`;
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const d = new Date(this.calendarYear, mIdx, day);
                const dk = this.fmtDate(d);
                const isToday = d.toDateString() === today.toDateString();
                const dayName = d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
                const isWO = weeklyOff.includes(dayName);
                const isHol = !!this.yearHolidayData[dk];
                const status = this.yearAttendanceData[dk];

                let bg = "";
                if (isToday) bg = "#2d2d2d";
                else if (isHol || status === "Holiday") bg = "#ff9800";
                else if (status === "Present") bg = "#98eeb8";
                else if (status === "Absent") bg = "#e49797";
                else if (status === "Half Day") bg = "rgb(238,225,105)";
                else if (status === "LWP") bg = "#9c27b0";
                else if (status === "Weekly Off" || isWO) bg = "#93c5fd";

                html += `<div style="
                    font-size:10px; text-align:center; padding:2px 1px; border-radius:2px;
                    background:${bg}; color:${bg && bg !== "" ? (bg === "#93c5fd" ? "#1e3a8a" : "#fff") : "#374151"};
                    font-weight:${bg ? "600" : "400"};
                ">${day}</div>`;
            }

            html += `</div></div>`;
            $grid.append(html);
        });
    },

    selectCalendarMonth(monthIdx) {
        $("#ba-month").val(monthIdx).trigger("change");
        this.closeCalendar();
    }
};