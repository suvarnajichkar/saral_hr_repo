frappe.ready(function () {

    // Search elements
    const searchInput = document.getElementById('employee-search-input');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee');

    let employees = [];
    let selectedIndex = -1;
    let filteredEmployees = [];

    // Fetch employees
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
                    
                    // Format: Name (Aadhaar Number)
                    let displayText = row.full_name;
                    if (row.aadhaar_number) {
                        displayText += ` (${row.aadhaar_number})`;
                    }
                    opt.text = displayText;
                    
                    employeeSelect.appendChild(opt);

                    window.employeeCompanyMap[row.employee] = row.company;
                    window.employeeCLMap[row.employee] = row.name;
                    window.employeeWeeklyOffMap[row.employee] = row.weekly_off
                        ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                        : [];
                });

                // Build employees array for search
                employees = Array.from(employeeSelect.options)
                    .filter(option => option.value)
                    .map(option => ({
                        value: option.value,
                        name: option.text.trim()
                    }));
            }
        }
    });

    // Search Functions (from Timeline)
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
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, index) =>
            `<div class="search-result-item" data-index="${index}" data-value="${emp.value}">
                ${escapeHtml(emp.name)}
            </div>`
        ).join('');
        searchResults.classList.add('show');

        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            item.addEventListener('click', () => {
                const empValue = item.getAttribute('data-value');
                const emp = employees.find(e => e.value === empValue);
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
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function selectEmployee(emp) {
        searchInput.value = emp.name;
        employeeSelect.value = emp.value;
        searchResults.classList.remove('show');
        selectedIndex = -1;

        // Trigger change event to update company and weekly off
        document.getElementById("company").value = window.employeeCompanyMap[emp.value] || "";
        document.getElementById("weekly_off").value = window.employeeWeeklyOffMap[emp.value]
            ? window.employeeWeeklyOffMap[emp.value]
                .map(d => d.charAt(0).toUpperCase() + d.slice(1))
                .join(", ")
            : "";

        generateTable();
    }

    // Search Input Events
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() === '') {
            filteredEmployees = employees;
            showResults(filteredEmployees);
        }
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        if (!searchTerm) {
            filteredEmployees = employees;
            showResults(filteredEmployees);
            selectedIndex = -1;
            return;
        }
        
        filteredEmployees = employees.filter(emp =>
            emp.name.toLowerCase().includes(searchTerm)
        );
        showResults(filteredEmployees);
        selectedIndex = -1;
    });

    // Keyboard Navigation
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
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && filteredEmployees[selectedIndex]) {
                selectEmployee(filteredEmployees[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            searchResults.classList.remove('show');
            selectedIndex = -1;
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
            selectedIndex = -1;
        }
    });

    // Original Attendance Functionality
    document.getElementById("start_date").addEventListener("change", function () {
        let startDate = this.value;
        if (startDate) {
            let date = new Date(startDate);
            let lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            document.getElementById("end_date").value =
                `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        }
        generateTable();
    });

    document.getElementById("end_date").addEventListener("change", generateTable);

    window.attendanceTableData = {};
    window.originalAttendanceData = {}; 

    function updateCounts() {
        let p = 0, a = 0, h = 0;

        Object.values(window.attendanceTableData).forEach(s => {
            if (s === "Present") p++;
            else if (s === "Absent") a++;
            else if (s === "Half Day") h++;
        });

        document.getElementById("present_count").textContent = p;
        document.getElementById("absent_count").textContent = a;
        document.getElementById("halfday_count").textContent = h;
    }

    function generateTable() {
        let employee = employeeSelect.value;
        if (!employee) return;

        let weeklyOffDays = window.employeeWeeklyOffMap[employee];
        let clId = window.employeeCLMap[employee];
        let startDate = document.getElementById("start_date").value;
        let endDate = document.getElementById("end_date").value;
        if (!startDate || !endDate) return;

        let tbody = document.getElementById("attendance_table_body");
        document.getElementById("attendance_table").style.display = "table";
        tbody.innerHTML = "";

        let start = new Date(startDate);
        let end = new Date(endDate);

        frappe.call({
            method: "saral_hr.www.mark_attendance.index.get_attendance_between_dates",
            args: { employee: clId, start_date: startDate, end_date: endDate },
            callback: function (res) {

                let attendanceMap = res.message || {};
                window.attendanceTableData = {};
                window.originalAttendanceData = {}; 

                let current = new Date(start);
                while (current <= end) {

                    let dayName = current.toLocaleDateString("en-US", { weekday: "long" });
                    let dateKey = current.toISOString().split("T")[0];

                    let isWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());

                    let today = new Date();
                    today.setHours(0,0,0,0);
                    let cur = new Date(current);
                    cur.setHours(0,0,0,0);
                    let isFuture = cur > today;

                    let savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;
                    
                    if (savedStatus) {
                        window.originalAttendanceData[dateKey] = savedStatus;
                    }

                    let row = document.createElement("tr");
                    if (isWeeklyOff) row.classList.add("weekly-off-row");
                    if (isFuture) row.classList.add("future-date-row");

                    row.innerHTML = `
                        <td>${dayName}</td>
                        <td>${current.getDate()} ${current.toLocaleDateString("en-US", { month: "long" })} ${current.getFullYear()}</td>
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

    function bulkMark(status) {
        Object.keys(window.attendanceTableData).forEach(date => {
            let radios = document.querySelectorAll(`input[name="status_${date}"]`);
            if (!radios.length) return;
            if (radios[0].disabled) return;

            if (window.originalAttendanceData[date]) return;

            radios.forEach(r => {
                r.checked = (r.value === status);
            });

            window.attendanceTableData[date] = status;
        });

        updateCounts();
    }

    document.getElementById("mark_present").onclick = () => bulkMark("Present");
    document.getElementById("mark_absent").onclick = () => bulkMark("Absent");
    document.getElementById("mark_halfday").onclick = () => bulkMark("Half Day");

    document.getElementById("save_attendance").onclick = function () {
        let employee = employeeSelect.value;
        if (!employee) return;

        let clId = window.employeeCLMap[employee];
        let calls = [];

        Object.entries(window.attendanceTableData).forEach(([date, status]) => {
            if (status) {
                calls.push(frappe.call({
                    method: "saral_hr.www.mark_attendance.index.save_attendance",
                    args: { employee: clId, attendance_date: date, status }
                }));
            }
        });

        Promise.all(calls).then(() => {
            frappe.show_alert({
                message: __("Attendance updated successfully"),
                indicator: "green"
            });

            generateTable();
        });
    };
});