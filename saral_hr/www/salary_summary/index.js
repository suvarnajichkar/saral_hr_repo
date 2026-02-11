frappe.ready(function() {

    const button = document.getElementById("get-data");

    if (button) {
        button.addEventListener("click", function() {

            let company = document.getElementById("company").value;
            let start_date = document.getElementById("start_date").value;
            let end_date = document.getElementById("end_date").value;

            frappe.call({
                method: "saral_hr.www.salary_summary.get_salary_data",
                args: {
                    company: company,
                    start_date: start_date,
                    end_date: end_date
                },
                callback: function(r) {

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

                    data.forEach(row => {
                        body.innerHTML += `
                            <tr>
                                <td>${row.employee_name}</td>
                                <td>${row.net_pay}</td>
                            </tr>
                        `;
                    });
                }
            });

        });
    }

});
