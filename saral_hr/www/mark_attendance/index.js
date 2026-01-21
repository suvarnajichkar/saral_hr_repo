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
            ? window.employeeWeeklyOffMap[emp].map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
            : "";

        generateTable();
    });

    document.getElementById("start_date").addEventListener("change", function() {
        let startDate = this.value;
        if (startDate) {
            let date = new Date(startDate);
            let lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            let year = lastDay.getFullYear();
            let month = String(lastDay.getMonth() + 1).padStart(2, '0');
            let day = String(lastDay.getDate()).padStart(2, '0');
            document.getElementById("end_date").value = `${year}-${month}-${day}`;
        }
        generateTable();
    });

    document.getElementById("end_date").addEventListener("change", generateTable);

    window.attendanceTableData = {};

    function updateCounts() {
        let presentCount = 0;
        let absentCount = 0;
        let halfdayCount = 0;

        Object.values(window.attendanceTableData).forEach(status => {
            if (status === "Present") presentCount++;
            else if (status === "Absent") absentCount++;
            else if (status === "Half Day") halfdayCount++;
        });

        document.getElementById("present_count").textContent = presentCount;
        document.getElementById("absent_count").textContent = absentCount;
        document.getElementById("halfday_count").textContent = halfdayCount;
    }

    function generateTable() {
        let employee = document.getElementById("employee").value;
        if (!employee) return;

        let weeklyOffDays = window.employeeWeeklyOffMap[employee];
        let clId = window.employeeCLMap[employee];
        let startDate = document.getElementById("start_date").value;
        let endDate = document.getElementById("end_date").value;
        if (!startDate || !endDate) return;

        let table = document.getElementById("attendance_table");
        let tbody = document.getElementById("attendance_table_body");
        tbody.innerHTML = "";
        table.style.display = "table";

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
                    let day = String(current.getDate()).padStart(2, '0');
                    let month = current.toLocaleDateString("en-US", { month: "long" });
                    let year = current.getFullYear();
                    let formattedDate = `${day} ${month} ${year}`;
                    let dateKey = current.toISOString().split("T")[0];

                    let isWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());

                    let savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;

                    let row = document.createElement("tr");
                    if (isWeeklyOff) row.classList.add("table-warning");

                    row.innerHTML = `
                        <td>${dayName}</td>
                        <td>${formattedDate}</td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Present" ${savedStatus === "Present" ? "checked" : ""} ${isWeeklyOff ? "disabled" : ""}>
                        </td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Absent" ${savedStatus === "Absent" ? "checked" : ""} ${isWeeklyOff ? "disabled" : ""}>
                        </td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Half Day" ${savedStatus === "Half Day" ? "checked" : ""} ${isWeeklyOff ? "disabled" : ""}>
                        </td>
                    `;

                    if (!isWeeklyOff) {
                        row.querySelectorAll("input[type=radio]").forEach(input => {
                            input.addEventListener("change", function () {
                                window.attendanceTableData[dateKey] = this.value;
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

    document.getElementById("mark_present").addEventListener("click", () => bulkMark("Present"));
    document.getElementById("mark_absent").addEventListener("click", () => bulkMark("Absent"));
    document.getElementById("mark_halfday").addEventListener("click", () => bulkMark("Half Day"));

    function bulkMark(status) {
        Object.keys(window.attendanceTableData).forEach(date => {
            let radio = document.querySelector(`input[name="status_${date}"][value="${status}"]`);
            if (radio && !radio.disabled) {
                radio.checked = true;
                window.attendanceTableData[date] = status;
            }
        });
        updateCounts();
    }

    document.getElementById("save_attendance").addEventListener("click", function () {
        let employee = document.getElementById("employee").value;
        if (!employee) return;

        let clId = window.employeeCLMap[employee];

        let saveCalls = [];
        Object.keys(window.attendanceTableData).forEach(date => {
            let status = window.attendanceTableData[date];
            if (status) {
                saveCalls.push(frappe.call({
                    method: "saral_hr.www.mark_attendance.index.save_attendance",
                    args: { employee: clId, attendance_date: date, status: status }
                }));
            }
        });

        Promise.all(saveCalls).then(() => {
            frappe.msgprint("Attendance updated successfully!");
            generateTable();
        }).catch((error) => {
            frappe.msgprint("Error saving attendance. Please try again.");
            console.error(error);
        });
    });

});