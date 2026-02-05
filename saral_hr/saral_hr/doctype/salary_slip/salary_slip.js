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
                total_half_days: d.total_half_days  // NEW: Set total half days
            });

            recalculate_salary(frm);
        }
    });
}

function recalculate_salary(frm) {

    let gross_salary = 0;
    let employee_deductions = 0;
    let cash_in_hand_deductions = 0;
    let employer_contribution = 0;

    let wd = flt(frm.doc.total_working_days);
    let pd = flt(frm.doc.payment_days);
    let variable_pct = flt(frm.variable_pay_percentage || 0);

    // ================= EARNINGS =================
    // All earnings (type = "Earning") go to gross_salary
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
        gross_salary += row.amount;
    });

    // ================= DEDUCTIONS =================
    // Process deductions based on flags:
    // 1. employer_contribution = 1 → add to employer_contribution (not employee deduction)
    // 2. deduct_from_cash_in_hand_only = 1 → add to cash_in_hand_deductions (not employee deduction)
    // 3. Otherwise → add to employee_deductions
    (frm.doc.deductions || []).forEach(row => {
        let base = flt(row.base_amount || row.amount || 0);
        row.base_amount = base;

        let amount = (row.depends_on_payment_days && wd > 0)
            ? (base / wd) * pd
            : base;

        row.amount = flt(amount, 2);

        // Flag 1: Employer contribution
        if (row.employer_contribution) {
            employer_contribution += row.amount;
            return;
        }

        // Flag 2: Deduct from cash in hand only
        if (row.deduct_from_cash_in_hand_only) {
            cash_in_hand_deductions += row.amount;
            return;
        }

        // Flag 3: Regular employee deduction
        // These are PF Employee, ESIC Employee, PT, LWF (employee portion), etc.
        employee_deductions += row.amount;
    });

    // ================= BROUGHT FORWARD (from previous month) =================
    // This value comes from previous month's carried_forward
    // It's automatically fetched in Python validate() method
    let brought_forward = flt(frm.doc.previous_carry_forward || 0);
    
    // Total Earnings = Gross Salary + Brought Forward
    let total_earnings = flt(gross_salary + brought_forward, 2);

    // ================= NET SALARY CALCULATION WITH ROUNDING =================
    // Step 1: Calculate actual net salary (with decimals)
    let actual_net_salary = total_earnings - employee_deductions;
    
    // Step 2: Round net salary
    // Choose your rounding method based on company policy:
    
    // Option 1: Round to nearest whole number
    let net_salary = Math.round(actual_net_salary);
    
    // Option 2: Round to nearest 5 (uncomment if needed)
    // let net_salary = Math.round(actual_net_salary / 5) * 5;
    
    // Option 3: Round to nearest 10 (uncomment if needed)
    // let net_salary = Math.round(actual_net_salary / 10) * 10;
    
    // Option 4: Round down (uncomment if needed)
    // let net_salary = Math.floor(actual_net_salary);

    // ================= CARRIED FORWARD CALCULATION =================
    // Carried Forward = The difference created by rounding
    // This will be added to next month's brought forward
    // Example: If actual = 31519.70 and rounded = 31515, then carried_forward = 4.70
    let carried_forward = flt(actual_net_salary - net_salary, 2);
    
    // Total Deductions includes the carried forward to balance the books
    // This ensures: Total Earnings - Total Deductions = Net Salary (rounded)
    let total_deductions = flt(employee_deductions + carried_forward, 2);

    // ================= OTHER FINAL CALCULATIONS =================
    // Cash in Hand = Net Salary - Cash in Hand Deductions
    let cash_in_hand = flt(net_salary - cash_in_hand_deductions, 2);
    
    // Monthly CTC = Gross Salary + Employer Contribution
    let monthly_ctc = flt(gross_salary + employer_contribution, 2);
    
    // Annual CTC = Monthly CTC × 12
    let annual_ctc = flt(monthly_ctc * 12, 2);

    // ================= SET ALL VALUES =================
    frm.set_value({
        gross_salary: flt(gross_salary, 2),
        total_earnings: total_earnings,
        brought_forward: brought_forward,
        carried_forward: carried_forward,
        total_deductions: total_deductions,
        total_employer_contribution: flt(employer_contribution, 2),
        cash_in_hand_deductions: flt(cash_in_hand_deductions, 2),
        net_salary: net_salary,
        cash_in_hand: cash_in_hand,
        monthly_ctc: monthly_ctc,
        annual_ctc: annual_ctc
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
        total_half_days: 0,  // NEW: Reset total half days
        gross_salary: 0,
        total_earnings: 0,
        brought_forward: 0,
        carried_forward: 0,
        total_deductions: 0,
        total_employer_contribution: 0,
        cash_in_hand_deductions: 0,
        net_salary: 0,
        cash_in_hand: 0,
        monthly_ctc: 0,
        annual_ctc: 0
    });

    frm.variable_pay_percentage = 0;
    frm.refresh_fields();
}


// ---

// ## Summary of Changes:

// ### **Python (salary_slip.py)**
// 1. ✅ Added `half_day_count` variable to track number of half days
// 2. ✅ Added logic to count half days: `half_day_count += 1`
// 3. ✅ Added calculation: `total_half_days = flt(half_day_count * 0.5, 2)`
// 4. ✅ Added `total_half_days` to return dictionary

// ### **JavaScript (salary_slip.js)**
// 1. ✅ Added `total_half_days: d.total_half_days` in `fetch_days_and_attendance` callback
// 2. ✅ Added `total_half_days: 0` in `reset_form` function

// ### **No DocType Changes Needed**
// - The field `total_half_days` already exists in your JSON ✅

// ---

// ## How It Works:

// **Example:**
// - Working Days: 26
// - Present: 24 full days
// - Half Days: 2 (attendance status = "Half Day")
// - Absent: 1 full day

// **Results:**
// - `half_day_count` = 2
// - `total_half_days` = 2 × 0.5 = **1.0** (displayed)
// - `present_days` = 24 + (2 × 0.5) = **25.0**
// - `absent_days` = 1 + (2 × 0.5) = **2.0**
// - `payment_days` = 26 - 2.0 = **24.0**

// **Salary Calculation:**
// ```
// Gross Salary = 30,000
// Payment Days = 24.0
// Working Days = 26
// Prorated Salary = (30,000 / 26) × 24.0 = 27,692.31