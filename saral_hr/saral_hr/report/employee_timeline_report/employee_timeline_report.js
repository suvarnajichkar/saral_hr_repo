// Copyright (c) 2026, sj and contributors
// For license information, please see license.txt

frappe.query_reports["Employee Timeline Report"] = {
    "filters": [
        {
            "fieldname": "employee",
            "label": __("Employee"),
            "fieldtype": "Link",
            "options": "Employee",
            "reqd": 0
        }
    ],

    "onload": function(report) {
        injectTimelineStyles();
    },

    "after_datatable_render": function(datatable_obj) {
        renderTimeline();
    }
};

function injectTimelineStyles() {
    if (document.getElementById('timeline-report-styles')) return;

    const style = document.createElement('style');
    style.id = 'timeline-report-styles';
    style.textContent = `
        .report-summary,
        .report-footer,
        .datatable-footer,
        .report-wrapper ~ .row,
        .report-run-btn-wrapper,
        .nb-small {
            display: none !important;
        }

        .report-wrapper {
            min-height: 80vh !important;
        }

        .timeline-report-container {
            padding: 20px 16px;
        }

        .timeline-empty {
            text-align: center;
            color: var(--text-muted);
            padding: 60px 20px;
            font-size: 14px;
        }

        /* The list itself draws the continuous vertical line on its left edge */
        .timeline-list {
            position: relative;
            padding-left: 40px;
            border-left: 2px solid var(--border-color, #d1d8dd);
            margin-left: 6px;
        }

        .tl-item {
            position: relative;
            padding-bottom: 20px;
        }

        .tl-item:last-child {
            padding-bottom: 0;
        }

        /* Dot sits on the left border line */
        .tl-dot {
            position: absolute;
            left: -47px;       /* pulls it onto the border-left line */
            top: 16px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--gray-400, #adb5bd);
            border: 2px solid white;
            box-shadow: 0 0 0 2px var(--gray-400, #adb5bd);
            z-index: 1;
        }

        .tl-item.active .tl-dot {
            background: var(--green-500, #28a745);
            box-shadow: 0 0 0 2px var(--green-500, #28a745);
        }

        /* The card */
        .tl-card {
            background: var(--gray-50, #f8f9fa);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius, 6px);
            padding: 14px 16px;
            max-width: 420px;
        }

        .tl-company {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 8px;
        }

        .tl-date {
            font-size: 13px;
            color: var(--text-muted);
            margin-bottom: 3px;
        }

        .tl-badge {
            display: inline-block;
            margin-top: 10px;
            padding: 3px 10px;
            font-size: 11px;
            font-weight: 500;
            border-radius: var(--border-radius, 6px);
        }

        .tl-badge.active {
            background: var(--green-100, #d4edda);
            color: var(--green-700, #155724);
        }

        .tl-badge.inactive {
            background: var(--gray-100, #f1f3f4);
            color: var(--gray-700, #555);
        }
    `;
    document.head.appendChild(style);
}

function renderTimeline() {
    const reportWrapper = document.querySelector('.report-wrapper');
    if (!reportWrapper) return;

    const report = frappe.query_report;
    if (!report) return;

    const data = report.data || [];

    const dtWrapper = reportWrapper.querySelector('.datatable');
    if (dtWrapper) dtWrapper.style.display = 'none';

    const old = reportWrapper.querySelector('.timeline-report-container');
    if (old) old.remove();

    const container = document.createElement('div');
    container.className = 'timeline-report-container';

    if (!data.length || (data.length === 1 && data[0].message)) {
        container.innerHTML = `<div class="timeline-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;color:var(--gray-500)">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>${data[0] && data[0].message ? data[0].message : 'No records found.'}</p>
        </div>`;
        reportWrapper.appendChild(container);
        return;
    }

    const listHtml = data.map(record => {
        const isActive = record.is_active == 1;
        const endDateHtml = record.end_date
            ? `<div class="tl-date"><strong>End:</strong> ${escHtml(record.end_date)}</div>`
            : '';

        return `
            <div class="tl-item ${isActive ? 'active' : ''}">
                <div class="tl-dot"></div>
                <div class="tl-card">
                    <div class="tl-company">${escHtml(record.company || '-')}</div>
                    <div class="tl-date"><strong>Start:</strong> ${escHtml(record.start_date || '-')}</div>
                    ${endDateHtml}
                    <span class="tl-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="timeline-list">${listHtml}</div>`;
    reportWrapper.appendChild(container);
}

function escHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}