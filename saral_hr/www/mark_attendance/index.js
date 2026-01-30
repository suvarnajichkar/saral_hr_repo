frappe.ready(function () {

    // ================================
    // Search elements
    // ================================
    const searchInput = document.getElementById('employee-search-input');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee');

    let employees = [];
    let selectedIndex = -1;
    let filteredEmployees = [];

    // ================================
    // Fetch employees
    // ================================
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
                    .map(o => ({ value: o.value, name: o.text.trim() }));
            }
        }
    });

    // ================================
    // Search helpers
    // ================================
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

    function showResults(results) {
        if (!results.length) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, i) =>
            `<div class="search-result-item" data-index="${i}" data-value="${emp.value}">
                ${escapeHtml(emp.name)}
            </div>`
        ).join('');

        searchResults.classList.add('show');

        searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const emp = employees.find(e => e.value === item.dataset.value);
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

        document.getElementById("company").value =
            window.employeeCompanyMap[emp.value] || "";

        document.getElementById("weekly_off").value =
            window.employeeWeeklyOffMap[emp.value]
                .map(d => d.charAt(0).toUpperCase() + d.slice(1))
                .join(", ");

        generateTable();
    }

    // ================================
    // Search events
    // ================================
    searchInput.addEventListener('focus', () => {
        filteredEmployees = employees;
        showResults(filteredEmployees);
    });

    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase().trim();
        filteredEmployees = employees.filter(e =>
            e.name.toLowerCase().includes(term)
        );
        showResults(filteredEmployees);
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
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });

    // ================================
    // Month & Year dropdown logic
    // ================================
    const yearSelect = document.getElementById("year_select");
    const monthSelect = document.getElementById("month_select");
    const startDateInput = document.getElementById("start_date");
    const endDateInput = document.getElementById("end_date");

    function updateDatesFromMonthYear() {
        if (!yearSelect.value || monthSelect.value === "") return;

        const year = yearSelect.value;
        const month = Number(monthSelect.value);

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        startDateInput.value =
            `${year}-${String(month + 1).padStart(2, "0")}-01`;

        endDateInput.value =
            `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

        generateTable();
    }

    yearSelect.addEventListener("change", updateDatesFromMonthYear);
    monthSelect.addEventListener("change", updateDatesFromMonthYear);

    // ================================
    // Attendance table logic
    // ================================
    window.attendanceTableData = {};
    window.originalAttendanceData = {};

    function updateCounts() {
        let p = 0, a = 0, h = 0;
        Object.values(window.attendanceTableData).forEach(s => {
            if (s === "Present") p++;
            else if (s === "Absent") a++;
            else if (s === "Half Day") h++;
        });
        present_count.textContent = p;
        absent_count.textContent = a;
        halfday_count.textContent = h;
    }

    function generateTable() {
        const employee = employeeSelect.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (!employee || !startDate || !endDate) return;

        const weeklyOffDays = window.employeeWeeklyOffMap[employee];
        const clId = window.employeeCLMap[employee];

        const tbody = document.getElementById("attendance_table_body");
        document.getElementById("attendance_table").style.display = "table";
        tbody.innerHTML = "";

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.get_attendance_between_dates",
            args: { employee: clId, start_date: startDate, end_date: endDate },
            callback: function (res) {

                const attendanceMap = res.message || {};
                window.attendanceTableData = {};
                window.originalAttendanceData = {};

                let current = new Date(startDate);
                const end = new Date(endDate);

                const today = new Date();
                today.setHours(0, 0, 0, 0);  // normalize today

                while (current <= end) {
                    let currentDate = new Date(current);
                    currentDate.setHours(0, 0, 0, 0);  // normalize current date

                    const dayName = currentDate.toLocaleDateString("en-US", { weekday: "long" });
                    const dateKey =
                        currentDate.getFullYear() + "-" +
                        String(currentDate.getMonth() + 1).padStart(2, "0") + "-" +
                        String(currentDate.getDate()).padStart(2, "0");

                    const isWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());
                    const isFuture = currentDate > today;  // disables only dates after today

                    const savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;
                    if (savedStatus) window.originalAttendanceData[dateKey] = savedStatus;

                    const row = document.createElement("tr");
                    if (isWeeklyOff) row.classList.add("weekly-off-row");
                    if (isFuture) row.classList.add("future-date-row");

                    row.innerHTML = `
                    <td>${dayName}</td>
                    <td>${currentDate.getDate()} ${currentDate.toLocaleDateString("en-US", { month: "long" })} ${currentDate.getFullYear()}</td>
                    ${["Present", "Absent", "Half Day"].map(s => `
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="${s}"
                                ${savedStatus === s ? "checked" : ""}
                                ${isWeeklyOff || isFuture ? "disabled" : ""}>
                        </td>
                    `).join("")}
                `;

                    if (!isWeeklyOff && !isFuture) {
                        row.querySelectorAll("input").forEach(i => {
                            i.addEventListener("change", () => {
                                window.attendanceTableData[dateKey] = i.value;
                                updateCounts();
                            });
                        });
                    }

                    tbody.appendChild(row);
                    current.setDate(current.getDate() + 1);
                }

                updateCounts();
            }
        });
    }

    // ================================
    // Bulk + Save
    // ================================
    function bulkMark(status) {
        Object.keys(window.attendanceTableData).forEach(date => {
            if (window.originalAttendanceData[date]) return;
            const radios = document.querySelectorAll(`input[name="status_${date}"]`);
            if (!radios.length || radios[0].disabled) return;
            radios.forEach(r => r.checked = (r.value === status));
            window.attendanceTableData[date] = status;
        });
        updateCounts();
    }

    mark_present.onclick = () => bulkMark("Present");
    mark_absent.onclick = () => bulkMark("Absent");
    mark_halfday.onclick = () => bulkMark("Half Day");

    save_attendance.onclick = function () {
        const employee = employeeSelect.value;
        if (!employee) return;

        const clId = window.employeeCLMap[employee];
        const calls = [];

        Object.entries(window.attendanceTableData).forEach(([date, status]) => {
            if (status) {
                calls.push(frappe.call({
                    method: "saral_hr.www.mark_attendance.index.save_attendance",
                    args: { employee: clId, attendance_date: date, status }
                }));
            }
        });

        Promise.all(calls).then(() => {
            frappe.show_alert({ message: "Attendance updated successfully", indicator: "green" });
            generateTable();
        });
    };

    // ================================
    // Calendar Modal Functions
    // ================================
    let currentCalendarYear = 2025;
    let yearAttendanceData = {};

    // Helper function to normalize date formats
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
    }

    window.closeCalendarModal = function () {
        const modal = document.getElementById('calendar-modal');
        modal.classList.remove('show');
    }

    window.changeYear = function (direction) {
        currentCalendarYear += direction;
        document.getElementById('selected-year').textContent = currentCalendarYear;
        loadYearAttendance();
    }

    function loadYearAttendance() {
        const employee = employeeSelect.value;
        const clId = window.employeeCLMap[employee];

        if (!clId) {
            console.error('No Company Link ID found');
            return;
        }

        const startDate = `${currentCalendarYear}-01-01`;
        const endDate = `${currentCalendarYear}-12-31`;

        console.log('Loading attendance for:', clId, 'Year:', currentCalendarYear);

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.get_attendance_between_dates",
            args: {
                employee: clId,
                start_date: startDate,
                end_date: endDate
            },
            callback: function (res) {
                const rawData = res.message || {};

                // Normalize all date keys
                yearAttendanceData = {};
                Object.entries(rawData).forEach(([dateKey, status]) => {
                    const normalized = normalizeDateKey(dateKey);
                    if (normalized) {
                        yearAttendanceData[normalized] = status;
                    }
                });

                console.log('✅ Loaded attendance data:', Object.keys(yearAttendanceData).length, 'records');

                renderMonthsGrid();
            },
            error: function (err) {
                console.error('❌ Error loading attendance:', err);
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
        let totalColoredDays = 0;

        monthNames.forEach((monthName, monthIndex) => {
            const monthCard = document.createElement('div');
            monthCard.className = 'month-card';
            monthCard.onclick = () => selectMonth(monthIndex);

            const firstDay = new Date(currentCalendarYear, monthIndex, 1);
            const lastDay = new Date(currentCalendarYear, monthIndex + 1, 0);
            const startDay = firstDay.getDay();
            const daysInMonth = lastDay.getDate();

            let miniCalendarHTML = `<div class="month-name">${monthName}</div><div class="mini-calendar">`;

            // Day headers
            dayNames.forEach(day => {
                miniCalendarHTML += `<div class="mini-calendar-header">${day}</div>`;
            });

            // Empty cells
            for (let i = 0; i < startDay; i++) {
                miniCalendarHTML += `<div class="mini-calendar-day empty"></div>`;
            }

            // Days of the month
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentCalendarYear, monthIndex, day);
                const dateKey = normalizeDateKey(date);
                const isToday = date.toDateString() === today.toDateString();
                const dayName = date
                    .toLocaleDateString("en-US", { weekday: "long" })
                    .toLowerCase();

                const isWeeklyOff = weeklyOffDays.includes(dayName);


                let dayClass = 'mini-calendar-day';
                if (isToday) dayClass += ' today';

                // attendance has highest priority
                const status = yearAttendanceData[dateKey];

                if (status === 'Present') {
                    dayClass += ' present';
                    totalColoredDays++;
                } else if (status === 'Absent') {
                    dayClass += ' absent';
                    totalColoredDays++;
                } else if (status === 'Half Day') {
                    dayClass += ' halfday';
                    totalColoredDays++;
                } else if (isWeeklyOff) {
                    dayClass += ' weekend'; // blue weekly off
                }


                miniCalendarHTML += `<div class="${dayClass}">${day}</div>`;
            }

            miniCalendarHTML += '</div>';
            monthCard.innerHTML = miniCalendarHTML;
            monthsGrid.appendChild(monthCard);
        });

        console.log(`✅ Rendered ${totalColoredDays} colored days in calendar`);
    }

    function selectMonth(monthIndex) {
        yearSelect.value = currentCalendarYear;
        monthSelect.value = monthIndex;

        const event = new Event('change');
        monthSelect.dispatchEvent(event);

        window.closeCalendarModal();
    }

    // Event listeners
    document.getElementById('get_attendance_info').onclick = function () {
        window.openCalendarModal();
    };

    document.getElementById('calendar-modal').addEventListener('click', function (e) {
        if (e.target === this) {
            window.closeCalendarModal();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            window.closeCalendarModal();
        }
    });
});