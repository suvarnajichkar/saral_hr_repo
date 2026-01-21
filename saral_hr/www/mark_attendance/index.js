frappe.ready(function () {

    frappe.call({
        method: "saral_hr.www.mark_attendance.index.get_active_employees",
        callback: function (r) {
            if (r.message) {
                let employeeSelect = document.getElementById("employee");
                employeeSelect.innerHTML = `<option value="">Select Employee</option>`;

                window.employeeCompanyMap = {};
                window.employeeCLMap = {};
                window.employeeWeeklyOffMap = {};

                r.message.forEach(row => {
                    let opt = document.createElement("option");
                    opt.value = row.employee;
                    opt.text = row.full_name;
                    employeeSelect.appendChild(opt);

                    window.employeeCompanyMap[row.employee] = row.company;
                    window.employeeCLMap[row.employee] = row.name;

                    window.employeeWeeklyOffMap[row.employee] = row.weekly_off
                        ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                        : [];
                });
            }
        }
    });

    document.getElementById("employee").addEventListener("change", function () {
        let emp = this.value;
        document.getElementById("company").value = window.employeeCompanyMap[emp] || "";

        document.getElementById("weekly_off").value = window.employeeWeeklyOffMap[emp]
            ? window.employeeWeeklyOffMap[emp]
                .map(d => d.charAt(0).toUpperCase() + d.slice(1))
                .join(", ")
            : "";

        generateTable();
    });

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
        let employee = document.getElementById("employee").value;
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

    // ✅ FIXED BULK MARK FUNCTION
    function bulkMark(status) {
        Object.keys(window.attendanceTableData).forEach(date => {
            let radios = document.querySelectorAll(`input[name="status_${date}"]`);
            if (!radios.length) return;
            if (radios[0].disabled) return;

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
        let employee = document.getElementById("employee").value;
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
            frappe.msgprint("Attendance updated successfully");
            generateTable();
        });
    };
});