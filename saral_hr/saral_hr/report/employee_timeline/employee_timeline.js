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
                    query: "saral_hr.saral_hr.report.employee_timeline.employee_timeline.employee_search"
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
            watchFilter(report);
        }, 400);
    },

    // Fires after Run/Refresh button
    after_datatable_render: function () {
        const report = frappe.query_report;
        if (!document.getElementById("emp-timeline-styles")) {
            injectStyles();
        }
        setupUI(report);
        setTimeout(() => {
            const val = getFilterVal();
            if (val) {
                if (window._etLoad) window._etLoad(val);
            } else {
                if (window._etClear) window._etClear();
            }
        }, 100);
    },
};


// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getFilterVal() {
    return (frappe.query_report.get_filter_value("employee") || "")
            .replace(/^"|"$/g, "").trim();
}

function watchFilter(report) {
    let lastVal = getFilterVal();
    let loadTimer = null;

    // Poll every 300ms — detect filter changes
    setInterval(() => {
        const currentVal = getFilterVal();
        if (currentVal === lastVal) return;
        lastVal = currentVal;

        clearTimeout(loadTimer);

        if (!currentVal) {
            // Empty — clear immediately, no API call
            if (window._etClear) window._etClear();
            return;
        }

        // Only load if value looks like a valid saved employee ID
        // (Frappe Link field only saves value after user picks from dropdown)
        loadTimer = setTimeout(() => {
            const stillVal = getFilterVal();
            if (stillVal === currentVal && window._etLoad) {
                window._etLoad(currentVal);
            }
        }, 400);
    }, 300);

    // Also wire up awesomplete select event — fires only when user picks from dropdown
    const empFilter = report.get_filter("employee");
    if (empFilter && empFilter.$input) {
        empFilter.$input.on("awesomplete-selectcomplete", function () {
            setTimeout(() => {
                const val = getFilterVal();
                if (val) {
                    lastVal = val;
                    if (window._etLoad) window._etLoad(val);
                }
            }, 150);
        });

        // Clear when input is manually emptied
        empFilter.$input.on("input", function () {
            if (!this.value.trim()) {
                lastVal = "";
                if (window._etClear) window._etClear();
            }
        });
    }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SETUP UI — inject HTML once, then expose loader
// ─────────────────────────────────────────────────────────────────────────────

function setupUI(report) {
    // Find container
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

    // Hide all Frappe default report elements
    pageEl.querySelectorAll(
        ".datatable, .dt-scrollable, .report-summary, .no-result-message, .chart-wrapper"
    ).forEach(el => el.style.setProperty("display", "none", "important"));

    // Hide footer bar (For comparison... Execution Time)
    pageEl.querySelectorAll("p, .filter-message").forEach(el => {
        el.style.setProperty("display", "none", "important");
    });

    // If UI already injected — just keep Frappe elements hidden
    if (pageEl.querySelector(".emp-timeline-root")) return;

    // Inject our UI HTML
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildRootHTML();
    pageEl.appendChild(wrapper.firstElementChild);

    const root            = pageEl.querySelector(".emp-timeline-root");
    const timelineSection = root.querySelector("#et-timeline-section");
    const timelineContent = root.querySelector("#et-timeline-content");
    const noData          = root.querySelector("#et-no-data");

    // Expose global loader
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
                    noData.style.display = "block";
                    return;
                }
                renderTimeline(data, timelineContent);
                timelineSection.style.display = "block";
            },
            error: () => {
                // Silently clear — don't show error toast
                timelineContent.innerHTML     = "";
                timelineSection.style.display = "none";
                noData.style.display          = "none";
            },
        });
    };

    // Clear timeline when employee filter is removed
    window._etClear = function() {
        timelineContent.innerHTML     = "";
        timelineSection.style.display = "none";
        noData.style.display          = "none";
    };

    // Hide footer bar (For comparison... Execution Time)
    function hideFooter() {
        // Target the exact bottom bar Frappe renders
        document.querySelectorAll(".page-main-content ~ div, .layout-main-section ~ div").forEach(el => {
            if (el.textContent && el.textContent.includes("For comparison")) {
                el.style.setProperty("display", "none", "important");
            }
        });
        // Also try direct text search in all divs
        document.querySelectorAll("div, p").forEach(el => {
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

    // Auto-load if filter already has value on page open
    const filterVal = getFilterVal();
    if (filterVal) window._etLoad(filterVal);
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

    /* Hide Frappe datatable & footer */
    .datatable, .dt-scrollable, .report-summary,
    .no-result-message, .chart-wrapper,
    .dt-header, .dt-body, .dt-footer {
        display: none !important;
    }

    /* Our timeline wrapper */
    .emp-timeline-root {
        padding: 20px 0;
    }

    /* Timeline container card */
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

    /* Timeline items */
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

    .emp-timeline-root .status-active  { background: var(--green-100); color: var(--green-700); }
    .emp-timeline-root .status-inactive { background: var(--gray-100);  color: var(--gray-700);  }

    /* No data message */
    .emp-timeline-root .no-data-message {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        padding: 60px 40px;
        text-align: center;
    }

    .emp-timeline-root .no-data-message svg { color: var(--gray-500); margin-bottom: 16px; }
    .emp-timeline-root .no-data-message p   { color: var(--text-muted) !important; font-size: 14px; margin: 0; display: block !important; }

    /* Awesomplete dropdown styling */
    .awesomplete > ul {
        border-radius: var(--border-radius, 6px) !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
        border: 1px solid var(--border-color) !important;
        font-size: 13px !important;
    }

    .awesomplete > ul > li {
        padding: 8px 12px !important;
        border-bottom: 1px solid var(--border-color) !important;
        cursor: pointer !important;
        line-height: 1.5 !important;
    }

    .awesomplete > ul > li:last-child { border-bottom: none !important; }

    .awesomplete > ul > li[aria-selected="true"],
    .awesomplete > ul > li:hover {
        background: var(--primary-bg-color, #e8f3fd) !important;
        color: var(--text-color) !important;
    }

    .awesomplete > ul > li > span:first-child {
        font-weight: 600 !important;
        color: var(--text-color) !important;
        display: block !important;
    }

    .awesomplete > ul > li > span:last-child {
        font-size: 11px !important;
        color: var(--text-muted) !important;
        display: block !important;
    }

    @media (max-width: 768px) {
        .emp-timeline-root { padding: 16px 0; }
        .emp-timeline-root .timeline-content { padding-left: 20px; }
    }
    `;
    document.head.appendChild(style);
}