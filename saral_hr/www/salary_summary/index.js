frappe.ready(function () {

    const button = document.getElementById("get-data");

    if (button) {
        button.addEventListener("click", function () {

            let company = document.getElementById("company").value;
            let start_date = document.getElementById("start_date").value;
            let end_date = document.getElementById("end_date").value;

            if (!start_date || !end_date) {
                frappe.msgprint("Please select both Start Date and End Date.");
                return;
            }

            frappe.call({
                method: "saral_hr.www.salary_summary.index.get_salary_data",  // ← fixed
                args: {
                    company: company,
                    start_date: start_date,
                    end_date: end_date
                },
                callback: function (r) {

                    let data = r.message || [];
                    let body = document.getElementById("result-body");
                    body.innerHTML = "";

                    if (data.length === 0) {
                        document.getElementById("result-container").style.display = "none";
                        document.getElementById("no-data").style.display = "block";
                        return;
                    }

                    document.getElementById("result-container").style.display = "block";
                    document.getElementById("no-data").style.display = "none";

                    let total_net_pay = 0;
                    let sr = 1;

                    data.forEach(function (row) {
                        total_net_pay += parseFloat(row.net_salary || 0);  // ← net_salary
                        body.innerHTML += `
        <tr>
            <td>${sr++}</td>
            <td>${row.employee || ""}</td>
            <td>${row.employee_name || ""}</td>
            <td>₹${parseFloat(row.net_salary || 0).toLocaleString("en-IN", {  // ← net_salary
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}</td>
        </tr>
    `;
                    });

                    body.innerHTML += `
                        <tr style="font-weight: 700; background: #f1f3f5;">
                            <td colspan="3">Total</td>
                            <td>₹${total_net_pay.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}</td>
                        </tr>
                    `;
                }
            });

        });
    }

});