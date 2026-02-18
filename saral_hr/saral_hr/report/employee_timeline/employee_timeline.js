frappe.query_reports["Employee Timeline"] = {
    filters: [
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee",
            mandatory: 0,
            get_query: function() {
                return {
                    query: "saral_hr.saral_hr.report.employee_timeline.employee_timeline.employee_search",
                    page_length: 200
                };
            },
        },
    ],

    onload: function (report) {
        if (!document.getElementById("emp-timeline-styles")) {
            injectStyles();
        }

        setTimeout(() => {
            setupUI(report);

            const empFilter = report.get_filter("employee");
            if (empFilter && empFilter.$input) {

                if (empFilter.df) {
                    empFilter.df.label_from_options = "employee_name";
                }

                empFilter.$input.on("input change", function () {
                    setTimeout(() => {
                        const val = (frappe.query_report.get_filter_value("employee") || "")
                                    .replace(/^"|"$/g, "").trim();
                        if (val) {
                            if (window._etLoad) window._etLoad(val);
                        } else {
                            if (window._etClear) window._etClear();
                        }
                    }, 200);
                });

                empFilter.df.onchange = function () {
                    const val = (frappe.query_report.get_filter_value("employee") || "")
                                .replace(/^"|"$/g, "").trim();
                    if (val) {
                        if (window._etLoad) window._etLoad(val);
                    } else {
                        if (window._etClear) window._etClear();
                    }
                };
            }
        }, 400);
    },

    after_datatable_render: function () {
        const report = frappe.query_report;
        if (!document.getElementById("emp-timeline-styles")) {
            injectStyles();
        }
        setupUI(report);
        setTimeout(() => {
            const val = (frappe.query_report.get_filter_value("employee") || "")
                        .replace(/^"|"$/g, "").trim();
            if (val) {
                if (window._etLoad) window._etLoad(val);
            } else {
                if (window._etClear) window._etClear();
            }
        }, 100);
    },
};


// ─────────────────────────────────────────────────────────────────────────────
//  SETUP UI
// ─────────────────────────────────────────────────────────────────────────────

function setupUI(report) {
    let pageEl;
    if (report.page && report.page.main && report.page.main.length) {
        pageEl = report.page.main[0];
    } else if (report.page && report.page.main) {
        pageEl = report.page.main;
    } else {
        pageEl = document.querySelector(".layout-main-section")
              || document.querySelector(".page-content")
              || document.body;
    }

    pageEl.querySelectorAll(
        ".datatable, .dt-scrollable, .report-summary, .no-result-message, .chart-wrapper"
    ).forEach(el => el.style.setProperty("display", "none", "important"));

    pageEl.querySelectorAll(".filter-message").forEach(el => {
        el.style.setProperty("display", "none", "important");
    });

    if (pageEl.querySelector(".emp-timeline-root")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildRootHTML();
    pageEl.insertBefore(wrapper.firstElementChild, pageEl.firstChild);

    const root       = pageEl.querySelector(".emp-timeline-root");
    const filterBar  = document.querySelector(".page-form");
    const filterSlot = root.querySelector("#et-filter-slot");
    if (filterBar && filterSlot) {
        filterSlot.appendChild(filterBar);
        filterBar.style.removeProperty("display");
        filterBar.style.padding    = "0";
        filterBar.style.margin     = "0 0 20px 0";
        filterBar.style.border     = "none";
        filterBar.style.background = "transparent";
    }

    const timelineSection = root.querySelector("#et-timeline-section");
    const timelineContent = root.querySelector("#et-timeline-content");
    const noData          = root.querySelector("#et-no-data");

    // ── Patch awesomplete: Name on top, ID below & show name after select ──
    setTimeout(() => {
        const empFilter = frappe.query_report.get_filter("employee");
        if (empFilter && empFilter.$input) {
            const inputEl = empFilter.$input[0];

            if (inputEl && inputEl._x_awesomplete) {
                inputEl._x_awesomplete.item = function(text, input) {
                    const parts = text.value ? text.value.split("\n") : [text.label || text];
                    const id    = parts[0] || "";
                    const name  = parts[1] || id;
                    const li = document.createElement("li");
                    li.setAttribute("aria-selected", "false");
                    li.innerHTML = `<span class="et-emp-name">${name}</span><span class="et-emp-id">${id}</span>`;
                    return li;
                };
            }

            // After selection — show employee name in input, not ID
            empFilter.$input.on("awesomplete-selectcomplete", function(e) {
                setTimeout(() => {
                    const val = (frappe.query_report.get_filter_value("employee") || "")
                                .replace(/^"|"$/g, "").trim();
                    if (val) {
                        frappe.db.get_value("Employee", val, ["first_name", "last_name"], (r) => {
                            if (r) {
                                const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
                                if (name) empFilter.$input.val(name);
                            }
                        });
                        if (window._etLoad) window._etLoad(val);
                    }
                }, 100);
            });
        }
    }, 800);

    window._etLoad = function(employee) {
        if (!employee) return;

        timelineContent.innerHTML     = "";
        timelineSection.style.display = "none";
        noData.style.display          = "none";

        frappe.call({
            method: "saral_hr.saral_hr.report.employee_timeline.employee_timeline.get_employee_timeline",
            args:   { employee },
            freeze: false,
            callback: (r) => {
                const data = r.message || [];
                if (!data.length) {
                    noData.style.display = "flex";
                    return;
                }
                renderTimeline(data, timelineContent);
                timelineSection.style.display = "block";
            },
            error: () => {
                noData.style.display = "flex";
            },
        });
    };

    window._etClear = function() {
        timelineContent.innerHTML     = "";
        timelineSection.style.display = "none";
        noData.style.display          = "none";
    };

    function hideFooter() {
        document.querySelectorAll("div, p").forEach(el => {
            if (el.closest(".emp-timeline-root")) return;
            if (el.children.length <= 2 &&
                el.textContent &&
                el.textContent.trim().startsWith("For comparison")) {
                el.style.setProperty("display", "none", "important");
            }
        });
    }
    hideFooter();
    setTimeout(hideFooter, 300);
    setTimeout(hideFooter, 800);
    setTimeout(hideFooter, 2000);

    let filterVal = (frappe.query_report.get_filter_value("employee") || "")
                     .replace(/^"|"$/g, "").trim();
    if (filterVal) window._etLoad(filterVal);

    setTimeout(() => {
        const empFilter = frappe.query_report.get_filter("employee");
        if (empFilter && empFilter.$input) {
            empFilter.$input.off("change.et").on("change.et", function () {
                const val = (frappe.query_report.get_filter_value("employee") || "")
                            .replace(/^"|"$/g, "").trim();
                if (val) window._etLoad(val);
            });
        }
    }, 500);
}


// ─────────────────────────────────────────────────────────────────────────────
//  TIMELINE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function renderTimeline(data, container) {
    const html = data.map(record => {
        const isActive    = record.is_active == 1;
        const statusText  = isActive ? "Active" : "Inactive";
        const endDateHTML = record.end_date
            ? `<div class="date-info"><strong>End:</strong> ${escapeHtml(record.end_date)}</div>`
            : "";

        return `
            <div class="timeline-item ${isActive ? "active" : ""}">
                <div class="timeline-card">
                    <div class="company-name">${escapeHtml(record.company)}</div>
                    <div class="date-info"><strong>Start:</strong> ${escapeHtml(record.start_date || "-")}</div>
                    ${endDateHTML}
                    <div class="status-wrapper">
                        <span class="status-badge ${isActive ? "status-active" : "status-inactive"}">
                            ${statusText}
                        </span>
                    </div>
                </div>
            </div>`;
    }).join("");

    container.innerHTML = html;
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text).replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;",
    })[m]);
}


// ─────────────────────────────────────────────────────────────────────────────
//  HTML TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function buildRootHTML() {
    return `
    <div class="emp-timeline-root">

        <div id="et-filter-slot" class="et-filter-slot"></div>

        <div id="et-timeline-section" class="timeline-container" style="display:none;">
            <h3 class="timeline-title">Employment History</h3>
            <div id="et-timeline-content" class="timeline-content"></div>
        </div>

        <div id="et-no-data" class="no-data-message" style="display:none;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>No employment records found for this employee.</p>
        </div>

    </div>`;
}


// ─────────────────────────────────────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────────────────────────────────────

function injectStyles() {
    const style = document.createElement("style");
    style.id = "emp-timeline-styles";
    style.textContent = `

    /* Hide ALL Frappe default report elements */
    .datatable, .dt-scrollable, .report-summary,
    .no-result-message, .chart-wrapper,
    .dt-header, .dt-body, .dt-footer {
        display: none !important;
    }

    /* Hide footer bar */
    .layout-main-section > p,
    .page-main-content > p,
    [data-page-route] p.text-muted,
    .report-footer,
    .filter-area {
        display: none !important;
    }

    /* Hide original filter bar from its old position */
    .page-form {
        display: none !important;
    }

    /* ── Root wrapper ── */
    .emp-timeline-root {
        max-width: 1100px;
        margin: 0 auto;
        padding: 24px 30px;
    }

    /* ── Filter slot ── */
    .et-filter-slot {
        margin-bottom: 20px;
    }

    .et-filter-slot .page-form {
        display: flex !important;
        padding: 0 !important;
        border: none !important;
        background: transparent !important;
        margin: 0 !important;
        flex-wrap: wrap;
        gap: 12px;
        align-items: flex-end;
    }

    /* ── Input box — smaller width ── */
    .et-filter-slot .page-form .form-group {
        flex: 0 0 280px !important;
        max-width: 280px !important;
        min-width: 200px !important;
    }

    .et-filter-slot .page-form .form-group .input-with-feedback,
    .et-filter-slot .page-form .form-group input[type="text"],
    .et-filter-slot .page-form .form-group input.input-xs {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 200px !important;
        font-size: 14px !important;
        padding: 8px 12px !important;
        height: 36px !important;
    }

    /* ── Dropdown list — taller ── */
    .awesomplete > ul {
        min-width: 280px !important;
        max-width: 380px !important;
        min-height: 400px !important;
        max-height: 70vh !important;
        overflow-y: auto !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
        border: 1px solid var(--border-color) !important;
        font-size: 13px !important;
        z-index: 9999 !important;
    }

    /* ── Each list item — flex column-reverse so Name on top, ID below ── */
    .awesomplete > ul > li {
        display: flex !important;
        flex-direction: column-reverse !important;
        padding: 8px 14px !important;
        border-bottom: 1px solid var(--border-color) !important;
        cursor: pointer !important;
        line-height: 1.4 !important;
    }

    .awesomplete > ul > li:last-child {
        border-bottom: none !important;
    }

    .awesomplete > ul > li[aria-selected="true"],
    .awesomplete > ul > li:hover {
        background: var(--primary-bg-color, #e8f3fd) !important;
        color: var(--text-color) !important;
    }

    /* ── Employee Name — bold, on top ── */
    .awesomplete > ul > li .et-emp-name,
    .awesomplete > ul > li > span:last-child {
        font-weight: 600 !important;
        font-size: 13px !important;
        color: var(--text-color) !important;
        display: block !important;
    }

    /* ── Employee ID — muted, below ── */
    .awesomplete > ul > li .et-emp-id,
    .awesomplete > ul > li > span:first-child {
        font-size: 11px !important;
        color: var(--text-muted) !important;
        display: block !important;
        margin-top: 1px !important;
    }

    /* ── Timeline container ── */
    .emp-timeline-root .timeline-container {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        padding: 24px;
    }

    .emp-timeline-root .timeline-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-color);
        margin: 0 0 24px 0;
    }

    .emp-timeline-root .timeline-content {
        padding-left: 28px;
    }

    .emp-timeline-root .timeline-item {
        border-left: 2px solid var(--border-color);
        padding-left: 24px;
        padding-bottom: 24px;
        position: relative;
    }

    .emp-timeline-root .timeline-item:last-child { padding-bottom: 0; }

    .emp-timeline-root .timeline-item::before {
        content: "";
        width: 10px;
        height: 10px;
        background: var(--gray-400);
        border: 3px solid var(--card-bg);
        border-radius: 50%;
        position: absolute;
        left: -6px;
        top: 20px;
        box-shadow: 0 0 0 2px var(--border-color);
    }

    .emp-timeline-root .timeline-item.active::before {
        background: var(--green-500);
        box-shadow: 0 0 0 2px var(--green-100);
    }

    .emp-timeline-root .timeline-card {
        background: var(--gray-50);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        padding: 16px;
    }

    .emp-timeline-root .company-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-color);
        margin-bottom: 10px;
    }

    .emp-timeline-root .date-info {
        font-size: 13px;
        color: var(--text-muted);
        margin-bottom: 4px;
    }

    .emp-timeline-root .status-wrapper {
        display: flex;
        align-items: center;
        margin-top: 10px;
    }

    .emp-timeline-root .status-badge {
        display: inline-block;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 500;
        border-radius: var(--border-radius);
    }

    .emp-timeline-root .status-active   { background: var(--green-100); color: var(--green-700); }
    .emp-timeline-root .status-inactive { background: var(--gray-100);  color: var(--gray-700);  }

    /* ── No data message ── */
    .emp-timeline-root .no-data-message {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        padding: 60px 40px;
        text-align: center;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 200px;
    }

    .emp-timeline-root .no-data-message svg {
        color: var(--gray-400);
        margin-bottom: 16px;
        display: block !important;
    }

    .emp-timeline-root .no-data-message p {
        color: var(--text-muted) !important;
        font-size: 14px !important;
        margin: 0 !important;
        display: block !important;
    }

    @media (max-width: 768px) {
        .emp-timeline-root { padding: 20px 16px; }
        .emp-timeline-root .timeline-content { padding-left: 20px; }
        .awesomplete > ul {
            min-width: 240px !important;
            max-width: 320px !important;
        }
        .et-filter-slot .page-form .form-group {
            flex: 0 0 240px !important;
            max-width: 240px !important;
        }
    }
    `;
    document.head.appendChild(style);
}