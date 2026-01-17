frappe.ready(function () {

    // --------- EMPLOYEE + COMPANY ---------
    frappe.call({
        method: "saral_hr.www.attendance_marking.index.get_active_employees",
        callback: function (r) {
            if (r.message) {
                let employeeSelect = document.getElementById("employee");

                window.employeeCompanyMap = {}; // Employee → Company
                window.employeeCLMap = {};      // Employee → Company Link ID

                r.message.forEach(row => {
                    let opt = document.createElement("option");
                    opt.value = row.employee;
                    opt.text = row.full_name;
                    employeeSelect.appendChild(opt);

                    window.employeeCompanyMap[row.employee] = row.company;
                    window.employeeCLMap[row.employee] = row.name; // Company Link ID
                });
            }
        }
    });

    document.getElementById("employee").addEventListener("change", function () {
        document.getElementById("company").value =
            window.employeeCompanyMap[this.value] || "";
        generateTable(); 
    });

    document.getElementById("start_date").addEventListener("change", generateTable);
    document.getElementById("end_date").addEventListener("change", generateTable);

    // --------- GLOBAL ATTENDANCE MAP ---------
    window.attendanceTableData = {}; // date → {status: 'Present'|'Absent'|'Half Day'|''}

    function generateTable() {
        let employee = document.getElementById("employee").value;
        if (!employee) return;

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

        if (start > end) {
            alert("End Date must be greater than or equal to Start Date");
            return;
        }

        // 🔹 Fetch existing attendance
        frappe.call({
            method: "saral_hr.www.attendance_marking.index.get_attendance_between_dates",
            args: { employee: clId, start_date: startDate, end_date: endDate },
            callback: function (res) {
                let attendanceMap = res.message || {};
                window.attendanceTableData = {}; // reset

                let current = new Date(start);
                while (current <= end) {
                    let dayName = current.toLocaleDateString("en-US", { weekday: "long" });
                    let formattedDate = current.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
                    let dateKey = current.toISOString().split("T")[0];

                    let savedStatus = attendanceMap[dateKey] || "";
                    window.attendanceTableData[dateKey] = savedStatus;

                    let row = document.createElement("tr");
                    row.setAttribute("data-date", dateKey);

                    row.innerHTML = `
                        <td>${dayName}</td>
                        <td>${formattedDate}</td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Present" ${savedStatus === "Present" ? "checked" : ""}>
                        </td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Absent" ${savedStatus === "Absent" ? "checked" : ""}>
                        </td>
                        <td class="text-center">
                            <input type="radio" name="status_${dateKey}" value="Half Day" ${savedStatus === "Half Day" ? "checked" : ""}>
                        </td>
                    `;

                    // Update table data on change (but not saved yet)
                    row.querySelectorAll("input[type=radio]").forEach(input => {
                        input.addEventListener("change", function () {
                            window.attendanceTableData[dateKey] = this.value;
                        });
                    });

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
            if (!window.attendanceTableData[date]) { // only mark empty rows
                window.attendanceTableData[date] = status;
                let radio = document.querySelector(`input[name="status_${date}"][value="${status}"]`);
                if (radio) radio.checked = true;
            }
        });
    }

    // --------- SAVE BUTTON ---------
    document.getElementById("save_attendance").addEventListener("click", function () {
        let employee = document.getElementById("employee").value;
        if (!employee) return;
        let clId = window.employeeCLMap[employee];

        Object.keys(window.attendanceTableData).forEach(date => {
            let status = window.attendanceTableData[date];
            if (status) {
                frappe.call({
                    method: "saral_hr.www.attendance_marking.index.save_attendance",
                    args: { employee: clId, attendance_date: date, status: status }
                });
            }
        });

        frappe.msgprint("Attendance saved successfully!");
        generateTable(); // reload table with saved data
    });
});
