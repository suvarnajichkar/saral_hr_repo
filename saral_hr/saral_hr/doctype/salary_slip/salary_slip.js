frappe.ui.form.on("Salary Slip", {
    refresh(frm) {
        if (!frm.doc.currency) {
            frm.set_value("currency", "INR");
        }

        frm.set_query("employee", () => {
            return { filters: { is_active: 1 } };
        });
    },

    employee(frm) {
        if (!frm.doc.employee) return;
        reset_form(frm);
        fetch_salary(frm);
    },

    start_date(frm) {
        if (!frm.doc.start_date) return;
        set_end_date(frm);

        if (frm.doc.employee) {
            fetch_salary(frm);
            fetch_days_and_attendance(frm);
        }
    },

    working_days_calculation_method(frm) {
        if (!frm.doc.employee || !frm.doc.start_date) return;
        fetch_days_and_attendance(frm);
    }
});

frappe.ui.form.on("Salary Details", {
    amount(frm) {
        recalculate_salary(frm);
    },
    earnings_remove(frm) {
        recalculate_salary(frm);
    },
    deductions_remove(frm) {
        recalculate_salary(frm);
    }
});

function set_end_date(frm) {
    let start = frappe.datetime.str_to_obj(frm.doc.start_date);
    let end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    frm.set_value("end_date", frappe.datetime.obj_to_str(end));
}

function fetch_salary(frm) {
    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_salary_structure_for_employee",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            if (!r.message) {
                frappe.msgprint("No Salary Structure found");
                return;
            }

            frm.set_value("salary_structure", r.message.salary_structure);
            frm.clear_table("earnings");
            frm.clear_table("deductions");

            (r.message.earnings || []).forEach(row => {
                let e = frm.add_child("earnings");
                Object.assign(e, row);
                e.base_amount = row.amount;
            });

            (r.message.deductions || []).forEach(row => {
                let d = frm.add_child("deductions");
                Object.assign(d, row);
                d.base_amount = row.amount;
            });

            frm.refresh_fields(["earnings", "deductions"]);
            fetch_variable_pay_percentage(frm);
            fetch_days_and_attendance(frm);
        }
    });
}

function fetch_variable_pay_percentage(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) {
        recalculate_salary(frm);
        return;
    }

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_variable_pay_percentage",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date
        },
        callback(r) {
            frm.variable_pay_percentage = flt(r.message || 0) / 100;
            recalculate_salary(frm);
        }
    });
}

function fetch_days_and_attendance(frm) {
    if (!frm.doc.employee || !frm.doc.start_date) return;

    frappe.call({
        method: "saral_hr.saral_hr.doctype.salary_slip.salary_slip.get_attendance_and_days",
        args: {
            employee: frm.doc.employee,
            start_date: frm.doc.start_date,
            working_days_calculation_method: frm.doc.working_days_calculation_method
        },
        callback(r) {
            if (!r.message) return;

            let d = r.message;
            frm.set_value({
                total_working_days: d.working_days,
                payment_days: d.payment_days,
                present_days: d.present_days,
                absent_days: d.absent_days,
                weekly_offs_count: d.weekly_offs,
                total_half_days: d.total_half_days
            });

            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {
    let total_earnings = 0;
    let total_deductions = 0;
    let total_basic_da = 0;
    let total_employer_contribution = 0;
    let retention = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);

    let basic_amount = 0;
    let da_amount = 0;
    let conveyance_amount = 0;

    // ================= EARNINGS =================
    (frm.doc.earnings || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;

        if (row.salary_component &&
            row.salary_component.toLowerCase().includes("variable")) {

            if (wd > 0 && row.depends_on_payment_days) {
                amount = (base / wd) * pd * variable_pct;
            } else {
                amount = base * variable_pct;
            }
        } else {
            if (row.depends_on_payment_days && wd > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);
        total_earnings += row.amount;

        let comp = (row.salary_component || "").toLowerCase();

        if (comp.includes("basic")) {
            basic_amount = row.amount;
        }
        if (comp.includes("da") || comp.includes("dearness")) {
            da_amount = row.amount;
        }
        if (comp.includes("conveyance")) {
            conveyance_amount = row.amount;
        }
    });

    total_basic_da = basic_amount + da_amount;

    // ================= DEDUCTIONS =================
    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = 0;
        let comp = (row.salary_component || "").toLowerCase();

        // ===== ESIC EMPLOYEE =====
        if (comp.includes("esic") && !comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0075, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // ===== ESIC EMPLOYER =====
        else if (comp.includes("esic") && comp.includes("employer")) {
            if (base > 0) {
                if (total_earnings < 21000) {
                    amount = flt((total_earnings - conveyance_amount) * 0.0325, 2);
                } else {
                    amount = 0;
                }
            } else {
                amount = 0;
            }
        }
        // ===== PF - CORRECTED LOGIC =====
        // Formula: 1800 if (Basic + DA) >= 15000 else (Basic + DA) * 0.12
        else if (comp.includes("pf") || comp.includes("provident")) {
            if (base > 0) {
                let basic_da_total = basic_amount + da_amount;
                if (basic_da_total >= 15000) {
                    amount = 1800;
                } else {
                    amount = flt(basic_da_total * 0.12, 2);
                }
            } else {
                amount = 0;
            }
        }
        // ===== PT (Professional Tax) - SPECIAL LOGIC =====
        // Logic:
        // - Agar Salary Structure Assignment me PT = 0 (base = 0), to Salary Slip me bhi PT = 0 rahega
        // - Agar PT > 0 hai Salary Structure me, to:
        //   - February month (month = 2) me: PT = 300
        //   - Other months me: PT = 200
        // - Start date se month nikalta hai jo user ne Salary Slip me dala hai
        else if (comp.includes("pt") || comp.includes("professional tax")) {
            if (base > 0) {
                // Get month from start_date (1-12, where 1=January, 2=February, etc.)
                let start_date = frappe.datetime.str_to_obj(frm.doc.start_date);
                let month = start_date.getMonth() + 1; // getMonth() returns 0-11, so +1 for 1-12
                
                // February month me PT = 300, baaki sab months me PT = 200
                if (month === 2) {
                    amount = 300;
                } else {
                    amount = 200;
                }
            } else {
                // Agar Salary Structure me PT ka base amount 0 hai, to PT = 0
                amount = 0;
            }
        }
        // ===== Other Deductions (LWF, etc.) =====
        else {
            if (row.depends_on_payment_days && wd > 0 && base > 0) {
                amount = (base / wd) * pd;
            } else {
                amount = base;
            }
        }

        row.amount = flt(amount, 2);

        if (row.employer_contribution) {
            total_employer_contribution += row.amount;
        } else {
            total_deductions += row.amount;
        }

        if (comp.includes("retention")) {
            retention += row.amount;
        }
    });

    let net_salary = flt(total_earnings - total_deductions, 2);

    frm.set_value({
        total_earnings: flt(total_earnings, 2),
        total_deductions: flt(total_deductions, 2),
        net_salary: net_salary,
        total_basic_da: flt(total_basic_da, 2),
        total_employer_contribution: flt(total_employer_contribution, 2),
        retention: flt(retention, 2)
    });

    frm.refresh_fields(["earnings", "deductions"]);
}

function reset_form(frm) {
    frm.clear_table("earnings");
    frm.clear_table("deductions");

    frm.set_value({
        total_working_days: 0,
        payment_days: 0,
        present_days: 0,
        absent_days: 0,
        weekly_offs_count: 0,
        total_half_days: 0,
        total_earnings: 0,
        total_deductions: 0,
        net_salary: 0,
        total_basic_da: 0,
        total_employer_contribution: 0,
        retention: 0
    });

    frm.variable_pay_percentage = 0;
    frm.refresh_fields();
}