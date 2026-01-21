frappe.ready(function () {

    const employeeSelect = document.getElementById('employee-select');
    const timelineContainer = document.getElementById('timeline-container');
    const timelineContent = document.getElementById('timeline-content');
    const noData = document.getElementById('no-data');

    if (typeof $ !== 'undefined' && $.fn.select2) {
        $('#employee-select').select2({
            placeholder: "-- Select Employee --",
            allowClear: true,
            width: '100%',
            theme: 'default'
        });

        $('#employee-select').on('select2:select', function (e) {
            const employee = e.params.data.id;
            loadEmployeeTimeline(employee);
        });

        $('#employee-select').on('select2:clear', function () {
            timelineContainer.style.display = 'none';
            noData.style.display = 'none';
            timelineContent.innerHTML = '';
        });

    } else {
        employeeSelect.addEventListener('change', function () {
            const employee = this.value;
            loadEmployeeTimeline(employee);
        });
    }

    function loadEmployeeTimeline(employee) {

        if (!employee) {
            timelineContainer.style.display = 'none';
            noData.style.display = 'none';
            timelineContent.innerHTML = '';
            return;
        }

        timelineContent.innerHTML = '';
        timelineContainer.style.display = 'none';
        noData.style.display = 'none';

        frappe.call({
            method: 'saral_hr.www.employee_timeline.index.get_employee_timeline',
            args: { employee },
            freeze: false,
            callback: function (r) {

                const data = r.message || [];

                if (!data.length) {
                    timelineContainer.style.display = 'none';
                    noData.style.display = 'block';
                    return;
                }

                renderTimeline(data);
                timelineContainer.style.display = 'block';
                noData.style.display = 'none';
            },
            error: function (err) {
                console.error('Timeline error:', err);
                timelineContainer.style.display = 'none';
                noData.style.display = 'block';
            }
        });
    }

    function renderTimeline(data) {
        let html = '';

        data.forEach(function (record) {

            const isActive = !record.end_date;
            const statusText = isActive ? 'Active' : 'Inactive';

            html += `
                <div class="timeline-item ${isActive ? 'active' : ''}">
                    <div class="timeline-card">
                        <div class="company-name">${escapeHtml(record.company)}</div>
                        <div class="date-info">
                            <strong>Start Date:</strong> ${record.start_date || '-'}
                        </div>
                        ${record.end_date ? `
                            <div class="date-info">
                                <strong>End Date:</strong> ${record.end_date}
                            </div>
                        ` : ''}
                        <div class="status-wrapper">
                            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });

        timelineContent.innerHTML = html;
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, function (m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }

});
