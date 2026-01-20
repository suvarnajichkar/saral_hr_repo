frappe.ready(function () {

    // --------- EMPLOYEE + COMPANY + WEEKLY OFF ---------
    frappe.call({
        method: "saral_hr.www.mark_attendance.index.get_active_employees",
        callback: function (r) {
            if (r.message) {
                let employeeSelect = document.getElementById("employee");
                employeeSelect.innerHTML = `<option value="">Select Employee</option>`;

                window.employeeCompanyMap = {};
                window.employeeCLMap = {};
                window.employeeWeeklyOffMap = {}; // weekly offs

                r.message.forEach(row => {
                    let opt = document.createElement("option");
                    opt.value = row.employee;
                    opt.text = row.full_name;
                    employeeSelect.appendChild(opt);

                    window.employeeCompanyMap[row.employee] = row.company;
                    window.employeeCLMap[row.employee] = row.name;

                    // Normalize weekly offs to lowercase array
                    window.employeeWeeklyOffMap[row.employee] = row.weekly_off
                        ? row.weekly_off.split(",").map(d => d.trim().toLowerCase())
                        : [];

                    // Debug
                    console.log("Weekly Off for", row.full_name, window.employeeWeeklyOffMap[row.employee]);
                });
            }
        }
    });

    // --------- Employee Change Event ---------
    document.getElementById("employee").addEventListener("change", function () {
        let emp = this.value;
        document.getElementById("company").value = window.employeeCompanyMap[emp] || "";

        // Populate weekly off field
        document.getElementById("weekly_off").value = window.employeeWeeklyOffMap[emp]
            ? window.employeeWeeklyOffMap[emp].map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
            : "";

        generateTable();
    });

    document.getElementById("start_date").addEventListener("change", generateTable);
    document.getElementById("end_date").addEventListener("change", generateTable);

    // --------- GLOBAL ATTENDANCE MAP ---------
    window.attendanceTableData = {};

    function generateTable() {
        let employee = document.getElementById("employee").value;
        if (!employee) return;

        let weeklyOffDays = window.employeeWeeklyOffMap[employee]; // array of weekly offs
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
                    // Format date as "01 November 2025" with zero-padded day
                    let day = String(current.getDate()).padStart(2, '0');
                    let month = current.toLocaleDateString("en-US", { month: "long" });
                    let year = current.getFullYear();
                    let formattedDate = `${day} ${month} ${year}`;
                    let dateKey = current.toISOString().split("T")[0];

                    // Check if this day is a weekly off (normalize to lowercase)
                    let isWeeklyOff = weeklyOffDays.includes(dayName.toLowerCase());

                    // Save attendance
                    let savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;

                    // Create row
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

                    // Only attach change listener if not weekly off
                    if (!isWeeklyOff) {
                        row.querySelectorAll("input[type=radio]").forEach(input => {
                            input.addEventListener("change", function () {
                                window.attendanceTableData[dateKey] = this.value;
                            });
                        });
                    }

                    tbody.appendChild(row);
                    current.setDate(current.getDate() + 1);
                }
            }
        });
    }

    // --------- BULK BUTTONS ---------
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
    }

    // --------- SAVE BUTTON ---------
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