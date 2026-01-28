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
    // Attendance table logic (UNCHANGED)
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

                while (current <= end) {
                    const dayName = current.toLocaleDateString("en-US", { weekday: "long" });
                    const dateKey = current.toISOString().split("T")[0];

                    const isWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());
                    const today = new Date(); today.setHours(0,0,0,0);
                    const isFuture = current > today;

                    const savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;
                    if (savedStatus) window.originalAttendanceData[dateKey] = savedStatus;

                    const row = document.createElement("tr");
                    if (isWeeklyOff) row.classList.add("weekly-off-row");
                    if (isFuture) row.classList.add("future-date-row");

                    row.innerHTML = `
                        <td>${dayName}</td>
                        <td>${current.getDate()} ${current.toLocaleDateString("en-US",{month:"long"})} ${current.getFullYear()}</td>
                        ${["Present","Absent","Half Day"].map(s => `
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
    // Bulk + Save (UNCHANGED)
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
});
