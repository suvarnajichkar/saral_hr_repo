frappe.ready(function () {

    const searchInput = document.getElementById('employee-search-input');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee');
    const clearBtn = document.getElementById('clear-search');

    let employees = [];
    let selectedIndex = -1;
    let filteredEmployees = [];
    let searchDebounceTimer = null;

    frappe.call({
        method: "saral_hr.www.mark_attendance.index.get_active_employees",
        callback: function (r) {
            if (r.message) {
                employeeSelect.innerHTML = `<option value="">Select Employee</option>`;

                window.employeeCompanyMap = {};
                window.employeeCLMap = {};
                window.employeeWeeklyOffMap = {};

                r.message.forEach(row => {
                    let opt = document.createElement("option");
                    opt.value = row.employee;

                    let displayText = row.full_name;
                    if (row.aadhaar_number) {
                        displayText += ` (${row.aadhaar_number})`;
                    }
                    opt.text = displayText;

                    employeeSelect.appendChild(opt);

                    window.employeeCompanyMap[row.employee] = row.company;
                    window.employeeCLMap[row.employee] = row.name;
                    window.employeeWeeklyOffMap[row.employee] =
                        row.weekly_off
                            ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                            : [];
                });

                employees = Array.from(employeeSelect.options)
                    .filter(o => o.value)
                    .map(o => ({
                        value: o.value,         // HR-EMP-XXXXX
                        name: o.text.trim(),    // Full name (Aadhaar)
                        emp_id: o.value         // HR-EMP-XXXXX for ID search
                    }));
            }
        }
    });

    // ─── Search Logic ─────────────────────────────────────────────

    /**
     * Local search — searches display name and emp ID instantly
     */
    function localSearch(searchTerm) {
        if (!searchTerm) return employees;
        const lower = searchTerm.toLowerCase();
        return employees.filter(emp =>
            emp.name.toLowerCase().includes(lower) ||
            emp.emp_id.toLowerCase().includes(lower)
        );
    }

    /**
     * API search — server-side full text search
     * Searches: first_name, last_name, full name, emp ID, Aadhaar
     */
    function apiSearch(searchTerm, callback) {
        frappe.call({
            method: 'saral_hr.www.mark_attendance.index.search_employees',
            args: { query: searchTerm },
            freeze: false,
            callback: (r) => {
                if (r.message) {
                    // Convert API result to local format
                    const formatted = r.message.map(row => ({
                        value: row.employee,
                        name: row.full_name,
                        emp_id: row.employee,
                        company: row.company,
                        weekly_off: row.weekly_off,
                        aadhaar_number: row.aadhaar_number
                    }));
                    callback(formatted);
                } else {
                    callback([]);
                }
            },
            error: () => callback([])
        });
    }

    /**
     * Merge local and API results, deduplicating by employee value
     * API results take priority
     */
    function mergeResults(local, api) {
        const seen = new Set();
        const merged = [];

        for (const emp of api) {
            if (!seen.has(emp.value)) {
                seen.add(emp.value);
                merged.push(emp);
            }
        }

        for (const emp of local) {
            if (!seen.has(emp.value)) {
                seen.add(emp.value);
                merged.push(emp);
            }
        }

        return merged;
    }

    /**
     * Main search handler — instant local results + debounced API
     */
    function handleSearch(searchTerm) {
        const localResults = localSearch(searchTerm);
        filteredEmployees = localResults;
        showResults(localResults, searchTerm);

        clearTimeout(searchDebounceTimer);
        if (searchTerm.length >= 2) {
            searchDebounceTimer = setTimeout(() => {
                apiSearch(searchTerm, (apiResults) => {
                    const merged = mergeResults(localResults, apiResults);
                    filteredEmployees = merged;
                    showResults(merged, searchTerm);
                });
            }, 300);
        }
    }

    // ─── UI Rendering ─────────────────────────────────────────────

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[m]);
    }

    function highlightMatch(text, searchTerm) {
        if (!searchTerm) return escapeHtml(text);
        const escapedText = escapeHtml(text);
        const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        return escapedText.replace(regex, '<span class="highlight">$1</span>');
    }

    function showResults(results, searchTerm = '') {
        if (!results.length) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, i) =>
            `<div class="search-result-item" data-index="${i}" data-value="${emp.value}">
                <div class="result-name">${highlightMatch(emp.name, searchTerm)}</div>
                <div class="result-id">${highlightMatch(emp.emp_id, searchTerm)}</div>
            </div>`
        ).join('');

        searchResults.classList.add('show');

        searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const emp = filteredEmployees.find(e => e.value === item.dataset.value)
                         || employees.find(e => e.value === item.dataset.value);
                if (emp) selectEmployee(emp);
            });

            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                highlightResult();
            });
        });
    }

    function highlightResult() {
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === selectedIndex);
        });
        if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function selectEmployee(emp) {
        searchInput.value = emp.name;
        employeeSelect.value = emp.value;
        searchResults.classList.remove('show');
        selectedIndex = -1;
        clearBtn.classList.add('show');
        clearTimeout(searchDebounceTimer);

        // If API result has company/weekly_off, update maps too
        if (emp.company) {
            window.employeeCompanyMap[emp.value] = emp.company;
        }
        if (emp.weekly_off !== undefined) {
            window.employeeWeeklyOffMap[emp.value] =
                emp.weekly_off
                    ? emp.weekly_off.split(",").map(d => d.trim().toLowerCase())
                    : [];
        }

        document.getElementById("company").value =
            window.employeeCompanyMap[emp.value] || "";

        document.getElementById("weekly_off").value =
            (window.employeeWeeklyOffMap[emp.value] || [])
                .map(d => d.charAt(0).toUpperCase() + d.slice(1))
                .join(", ");

        generateTable();
    }

    function clearSearch() {
        searchInput.value = '';
        employeeSelect.value = '';
        document.getElementById("company").value = '';
        document.getElementById("weekly_off").value = '';
        clearBtn.classList.remove('show');
        searchResults.classList.remove('show');
        document.getElementById("attendance_table").style.display = "none";
        window.attendanceTableData = {};
        window.originalAttendanceData = {};
        clearTimeout(searchDebounceTimer);
        updateCounts();
    }

    clearBtn.addEventListener('click', clearSearch);

    // ─── Event Listeners ──────────────────────────────────────────

    searchInput.addEventListener('focus', () => {
        const term = searchInput.value.trim().toLowerCase();
        filteredEmployees = term ? localSearch(term) : employees;
        showResults(filteredEmployees, term);
    });

    searchInput.addEventListener('input', () => {
        const term = searchInput.value.trim();

        if (searchInput.value.length > 0) {
            clearBtn.classList.add('show');
        } else {
            clearBtn.classList.remove('show');
        }

        if (!term) {
            filteredEmployees = employees;
            if (searchInput === document.activeElement) {
                showResults(filteredEmployees, '');
            }
            selectedIndex = -1;
            clearTimeout(searchDebounceTimer);
            return;
        }

        handleSearch(term.toLowerCase());
        selectedIndex = -1;
    });

    searchInput.addEventListener('keydown', (e) => {
        if (!searchResults.classList.contains('show')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredEmployees.length;
            highlightResult();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredEmployees.length) % filteredEmployees.length;
            highlightResult();
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectEmployee(filteredEmployees[selectedIndex]);
        } else if (e.key === 'Escape') {
            searchResults.classList.remove('show');
        }
    });

    document.addEventListener('click', e => {
        if (!searchInput.contains(e.target) &&
            !searchResults.contains(e.target) &&
            !clearBtn.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });

    // ─── Date / Table Logic (unchanged) ───────────────────────────

    const yearSelect = document.getElementById("year_select");
    const monthSelect = document.getElementById("month_select");
    const startDateInput = document.getElementById("start_date");
    const endDateInput = document.getElementById("end_date");

    function updateDatesFromMonthYear() {
        if (!yearSelect.value || monthSelect.value === "") return;

        const year = yearSelect.value;
        const month = Number(monthSelect.value);
        const lastDay = new Date(year, month + 1, 0);

        startDateInput.value = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        endDateInput.value = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

        generateTable();
    }

    yearSelect.addEventListener("change", updateDatesFromMonthYear);
    monthSelect.addEventListener("change", updateDatesFromMonthYear);

    window.attendanceTableData = {};
    window.originalAttendanceData = {};
    window.holidayDates = {};

    function updateCounts() {
        let p = 0, a = 0, h = 0, w = 0, hol = 0, lwp = 0;
        Object.values(window.attendanceTableData).forEach(s => {
            if (s === "Present") p++;
            else if (s === "Absent") a++;
            else if (s === "Half Day") h++;
            else if (s === "Weekly Off") w++;
            else if (s === "Holiday") hol++;
            else if (s === "LWP") lwp++;
        });
        document.getElementById('present_count').textContent = p;
        document.getElementById('absent_count').textContent = a;
        document.getElementById('halfday_count').textContent = h;
        if (document.getElementById('lwp_count')) {
            document.getElementById('lwp_count').textContent = lwp;
        }
    }

    function generateTable() {
        const employee = employeeSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (!employee || !startDate || !endDate) return;

        const weeklyOffDays = window.employeeWeeklyOffMap[employee];
        const clId = window.employeeCLMap[employee];
        const company = window.employeeCompanyMap[employee];

        const tbody = document.getElementById("attendance_table_body");
        const table = document.getElementById("attendance_table");

        table.style.display = "table";
        tbody.style.opacity = "0.5";

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.get_holidays_between_dates",
            args: { company: company, start_date: startDate, end_date: endDate },
            callback: function (holidayRes) {
                const holidays = holidayRes.message || [];
                window.holidayDates = {};
                holidays.forEach(h => {
                    window.holidayDates[h] = true;
                });

                frappe.call({
                    method: "saral_hr.www.mark_attendance.index.get_attendance_between_dates",
                    args: { employee: clId, start_date: startDate, end_date: endDate },
                    callback: function (res) {
                        const attendanceMap = res.message || {};
                        window.attendanceTableData = {};
                        window.originalAttendanceData = {};

                        tbody.innerHTML = "";

                        let current = new Date(startDate);
                        const end = new Date(endDate);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        while (current <= end) {
                            let currentDate = new Date(current);
                            currentDate.setHours(0, 0, 0, 0);

                            const dayName = currentDate.toLocaleDateString("en-US", { weekday: "long" });
                            const dateKey =
                                currentDate.getFullYear() + "-" +
                                String(currentDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(currentDate.getDate()).padStart(2, "0");

                            const isDefaultWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());
                            const isHoliday = window.holidayDates[dateKey] === true;
                            const isFuture = currentDate > today;

                            let savedStatus = attendanceMap[dateKey] || "";

                            if (!savedStatus) {
                                if (isHoliday) savedStatus = "Holiday";
                                else if (isDefaultWeeklyOff) savedStatus = "Weekly Off";
                            }

                            window.attendanceTableData[dateKey] = savedStatus;

                            if (savedStatus) {
                                window.originalAttendanceData[dateKey] = savedStatus;
                            }

                            const row = document.createElement("tr");

                            if (isHoliday) {
                                row.classList.add("holiday-row");
                            } else if (savedStatus === "Weekly Off" || (isDefaultWeeklyOff && savedStatus === "")) {
                                row.classList.add("weekly-off-row");
                            }

                            if (isFuture) row.classList.add("future-date-row");

                            const toggleChecked = savedStatus === "Weekly Off" ||
                                savedStatus === "Holiday" ||
                                (isDefaultWeeklyOff && savedStatus === "") ||
                                isHoliday;

                            const disableRadios = savedStatus === "Weekly Off" ||
                                (isDefaultWeeklyOff && savedStatus === "") ||
                                savedStatus === "Holiday" ||
                                isHoliday ||
                                isFuture;

                            const toggleColumn = !isFuture ? `
                                <td class="text-center" style="padding: 8px;">
                                    <label class="toggle-switch" title="${toggleChecked ? 'Mark attendance' : 'Mark as weekly off'}">
                                        <input type="checkbox" class="weekly-off-toggle"
                                            data-date="${dateKey}"
                                            ${toggleChecked ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </td>
                            ` : '<td class="text-center">—</td>';

                            row.innerHTML = `
                                <td>${dayName}</td>
                                <td>${currentDate.getDate()} ${currentDate.toLocaleDateString("en-US", { month: "long" })} ${currentDate.getFullYear()}</td>
                                ${toggleColumn}
                                ${["Present", "Absent", "Half Day", "LWP"].map(s => `
                                    <td class="text-center">
                                        <input type="radio" name="status_${dateKey}" value="${s}"
                                            ${savedStatus === s ? "checked" : ""}
                                            ${disableRadios ? "disabled" : ""}>
                                    </td>
                                `).join("")}
                            `;

                            if (!isFuture) {
                                const toggleInput = row.querySelector('.weekly-off-toggle');
                                if (toggleInput) {
                                    toggleInput.addEventListener('change', function () {
                                        const date = this.dataset.date;
                                        const isChecked = this.checked;
                                        const radios = row.querySelectorAll(`input[name="status_${date}"]`);

                                        if (isChecked) {
                                            const isHol = window.holidayDates[date];
                                            if (isHol) {
                                                row.classList.add("holiday-row");
                                                row.classList.remove("weekly-off-row");
                                                window.attendanceTableData[date] = "Holiday";
                                            } else {
                                                row.classList.add("weekly-off-row");
                                                row.classList.remove("holiday-row");
                                                window.attendanceTableData[date] = "Weekly Off";
                                            }
                                            radios.forEach(radio => {
                                                radio.disabled = true;
                                                radio.checked = false;
                                            });
                                        } else {
                                            row.classList.remove("weekly-off-row");
                                            row.classList.remove("holiday-row");
                                            radios.forEach(radio => { radio.disabled = false; });
                                            row.querySelectorAll(`input[name="status_${date}"]`).forEach(radio => {
                                                radio.addEventListener("change", function () {
                                                    window.attendanceTableData[date] = this.value;
                                                    updateCounts();
                                                });
                                            });
                                            window.attendanceTableData[date] = "";
                                        }
                                        updateCounts();
                                    });
                                }
                            }

                            if (!isFuture && !disableRadios) {
                                row.querySelectorAll("input[type='radio']").forEach(i => {
                                    i.addEventListener("change", function () {
                                        window.attendanceTableData[dateKey] = this.value;
                                        updateCounts();
                                    });
                                });
                            }

                            tbody.appendChild(row);
                            current.setDate(current.getDate() + 1);
                        }

                        tbody.style.opacity = "1";
                        updateCounts();
                    }
                });
            }
        });
    }

    function bulkMark(status) {
        Object.keys(window.attendanceTableData).forEach(date => {
            if (window.originalAttendanceData[date]) return;
            if (window.attendanceTableData[date] === "Weekly Off") return;
            if (window.attendanceTableData[date] === "Holiday") return;

            const radios = document.querySelectorAll(`input[name="status_${date}"]`);
            if (!radios.length || radios[0].disabled) return;

            radios.forEach(r => r.checked = (r.value === status));
            window.attendanceTableData[date] = status;
        });
        updateCounts();
    }

    document.getElementById('mark_present').onclick = () => bulkMark("Present");
    document.getElementById('mark_absent').onclick = () => bulkMark("Absent");
    document.getElementById('mark_halfday').onclick = () => bulkMark("Half Day");

    if (document.getElementById('mark_lwp')) {
        document.getElementById('mark_lwp').onclick = () => bulkMark("LWP");
    }

    document.getElementById('save_attendance').onclick = function () {
        const employee = employeeSelect.value;
        if (!employee) {
            frappe.show_alert({ message: "Please select an employee first", indicator: "orange" });
            return;
        }

        const clId = window.employeeCLMap[employee];

        const attendanceData = [];
        Object.entries(window.attendanceTableData).forEach(([date, status]) => {
            if (status && status.trim() !== "") {
                attendanceData.push({
                    employee: clId,
                    attendance_date: date,
                    status: status
                });
            }
        });

        if (attendanceData.length === 0) {
            frappe.show_alert({ message: "No attendance to save", indicator: "orange" });
            return;
        }

        const currentScrollPosition = document.querySelector('.table-scroll').scrollTop;

        const originalMsgprint = frappe.msgprint;
        const originalThrow = frappe.throw;

        frappe.msgprint = function (msg) {
            if (typeof msg === 'string' && msg.includes('Document has been modified')) return;
            originalMsgprint.apply(this, arguments);
        };

        frappe.throw = function (msg) {
            if (typeof msg === 'string' && msg.includes('Document has been modified')) return;
            originalThrow.apply(this, arguments);
        };

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.save_attendance_batch",
            args: { attendance_data: attendanceData },
            callback: function (r) {
                frappe.msgprint = originalMsgprint;
                frappe.throw = originalThrow;

                if (r.message && r.message.success) {
                    frappe.show_alert({ message: "Attendance updated successfully", indicator: "green" });
                    setTimeout(() => {
                        generateTable();
                        setTimeout(() => {
                            document.querySelector('.table-scroll').scrollTop = currentScrollPosition;
                        }, 100);
                    }, 300);
                } else {
                    frappe.show_alert({ message: "Error saving attendance", indicator: "red" });
                }
            },
            error: function (err) {
                frappe.msgprint = originalMsgprint;
                frappe.throw = originalThrow;
                if (err && err.message && !err.message.includes('Document has been modified')) {
                    frappe.show_alert({ message: "Error saving attendance", indicator: "red" });
                }
            }
        });
    };

    // ─── Calendar Modal (unchanged) ───────────────────────────────

    let currentCalendarYear = 2025;
    let yearAttendanceData = {};
    let yearHolidayData = {};

    function normalizeDateKey(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        const parts = dateStr.toString().split('-');
        if (parts.length === 3) {
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        return dateStr;
    }

    window.openCalendarModal = function () {
        const modal = document.getElementById('calendar-modal');
        const employee = employeeSelect.value;

        if (!employee) {
            frappe.show_alert({ message: "Please select an employee first", indicator: "orange" });
            return;
        }

        modal.classList.add('show');
        currentCalendarYear = parseInt(yearSelect.value) || new Date().getFullYear();
        document.getElementById('selected-year').textContent = currentCalendarYear;
        loadYearAttendance();
    };

    window.closeCalendarModal = function () {
        document.getElementById('calendar-modal').classList.remove('show');
    };

    window.changeYear = function (direction) {
        currentCalendarYear += direction;
        document.getElementById('selected-year').textContent = currentCalendarYear;
        loadYearAttendance();
    };

    function loadYearAttendance() {
        const employee = employeeSelect.value;
        const clId = window.employeeCLMap[employee];
        const company = window.employeeCompanyMap[employee];

        if (!clId) return;

        const startDate = `${currentCalendarYear}-01-01`;
        const endDate = `${currentCalendarYear}-12-31`;

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.get_holidays_between_dates",
            args: { company: company, start_date: startDate, end_date: endDate },
            callback: function (holidayRes) {
                yearHolidayData = {};
                (holidayRes.message || []).forEach(h => {
                    const normalized = normalizeDateKey(h);
                    if (normalized) yearHolidayData[normalized] = true;
                });

                frappe.call({
                    method: "saral_hr.www.mark_attendance.index.get_attendance_between_dates",
                    args: { employee: clId, start_date: startDate, end_date: endDate },
                    callback: function (res) {
                        yearAttendanceData = {};
                        Object.entries(res.message || {}).forEach(([dateKey, status]) => {
                            const normalized = normalizeDateKey(dateKey);
                            if (normalized) yearAttendanceData[normalized] = status;
                        });
                        renderMonthsGrid();
                    }
                });
            }
        });
    }

    function renderMonthsGrid() {
        const employee = employeeSelect.value;
        const weeklyOffDays = window.employeeWeeklyOffMap[employee] || [];

        const monthsGrid = document.getElementById('months-grid');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        monthsGrid.innerHTML = '';

        monthNames.forEach((monthName, monthIndex) => {
            const monthCard = document.createElement('div');
            monthCard.className = 'month-card';
            monthCard.onclick = () => selectMonth(monthIndex);

            const firstDay = new Date(currentCalendarYear, monthIndex, 1);
            const lastDay = new Date(currentCalendarYear, monthIndex + 1, 0);
            const startDay = firstDay.getDay();
            const daysInMonth = lastDay.getDate();

            let miniCalendarHTML = `<div class="month-name">${monthName}</div><div class="mini-calendar">`;

            dayNames.forEach(day => {
                miniCalendarHTML += `<div class="mini-calendar-header">${day}</div>`;
            });

            for (let i = 0; i < startDay; i++) {
                miniCalendarHTML += `<div class="mini-calendar-day empty"></div>`;
            }

            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentCalendarYear, monthIndex, day);
                const dateKey = normalizeDateKey(date);
                const isToday = date.toDateString() === today.toDateString();
                const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

                const isDefaultWeeklyOff = weeklyOffDays.includes(dayName);
                const isHoliday = yearHolidayData[dateKey] === true;

                let dayClass = 'mini-calendar-day';
                if (isToday) dayClass += ' today';

                const status = yearAttendanceData[dateKey];

                if (isHoliday || status === 'Holiday') dayClass += ' holiday';
                else if (status === 'Present') dayClass += ' present';
                else if (status === 'Absent') dayClass += ' absent';
                else if (status === 'Half Day') dayClass += ' halfday';
                else if (status === 'LWP') dayClass += ' lwp';
                else if (status === 'Weekly Off' || isDefaultWeeklyOff) dayClass += ' weekend';

                miniCalendarHTML += `<div class="${dayClass}">${day}</div>`;
            }

            miniCalendarHTML += '</div>';
            monthCard.innerHTML = miniCalendarHTML;
            monthsGrid.appendChild(monthCard);
        });
    }

    function selectMonth(monthIndex) {
        yearSelect.value = currentCalendarYear;
        monthSelect.value = monthIndex;
        monthSelect.dispatchEvent(new Event('change'));
        window.closeCalendarModal();
    }

    document.getElementById('get_attendance_info').onclick = () => window.openCalendarModal();

    document.getElementById('calendar-modal').addEventListener('click', function (e) {
        if (e.target === this) window.closeCalendarModal();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') window.closeCalendarModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            document.getElementById('save_attendance').click();
        }
    });
});