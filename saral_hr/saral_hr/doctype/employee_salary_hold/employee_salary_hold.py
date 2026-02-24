import frappe
from frappe.model.document import Document
from frappe.utils import today, getdate


class EmployeeSalaryHold(Document):

    def validate(self):
        self.validate_employee_not_already_on_hold()
        self.validate_release_fields()
        self.fetch_employee_details()

    def on_submit(self):
        self.update_salary_slip_hold_status(hold=True)

    def on_cancel(self):
        self.update_salary_slip_hold_status(hold=False)

    def validate_employee_not_already_on_hold(self):
        """Prevent duplicate active hold for the same employee."""
        if self.status == "On Hold":
            existing = frappe.db.get_value(
                "Employee Salary Hold",
                {
                    "employee": self.employee,
                    "status": "On Hold",
                    "docstatus": 1,
                    "name": ("!=", self.name),
                },
                "name",
            )
            if existing:
                frappe.throw(
                    f"Employee <b>{self.employee_name}</b> already has an active Salary Hold: "
                    f"<a href='/app/employee-salary-hold/{existing}'>{existing}</a>. "
                    "Please release the existing hold before creating a new one."
                )

    def validate_release_fields(self):
        """Release date and reason are mandatory when status is Released."""
        if self.status == "Released":
            if not self.release_date:
                frappe.throw("Release Date is mandatory when Status is <b>Released</b>.")
            if not self.release_reason:
                frappe.throw("Reason for Release is mandatory when Status is <b>Released</b>.")
            if self.hold_date and getdate(self.release_date) < getdate(self.hold_date):
                frappe.throw("Release Date cannot be earlier than Hold Date.")

    def fetch_employee_details(self):
        """Auto-populate department, designation, branch from Company Link."""
        if self.employee:
            emp = frappe.get_value(
                "Company Link",
                self.employee,
                ["department", "designation", "branch"],
                as_dict=True,
            )
            if emp:
                self.department = emp.department
                self.designation = emp.designation
                self.branch = emp.branch

    def update_salary_slip_hold_status(self, hold: bool):
        """
        Mark / unmark the linked Salary Slip as on hold.
        Only runs if the on_hold, hold_reason, release_reason columns
        exist on the Salary Slip table (added via Salary Slip DocType JSON).
        """
        if not self.salary_slip:
            return

        # Check if on_hold column exists before attempting db_set
        columns = frappe.db.get_table_columns("Salary Slip")
        if "on_hold" not in columns:
            frappe.log_error(
                "Column 'on_hold' not found in Salary Slip table. "
                "Please add on_hold, hold_reason, release_reason fields to Salary Slip DocType "
                "and run bench migrate.",
                "Employee Salary Hold"
            )
            return

        slip_docstatus = frappe.db.get_value("Salary Slip", self.salary_slip, "docstatus")
        if slip_docstatus not in [0, 1]:
            return

        frappe.db.set_value("Salary Slip", self.salary_slip, {
            "on_hold": 1 if hold else 0,
            "hold_reason": self.hold_reason if hold else None,
            "release_reason": None if hold else self.release_reason,
        })

        frappe.db.commit()


# ---------------------------------------------------------------------------
# Whitelisted API helpers
# ---------------------------------------------------------------------------

@frappe.whitelist()
def release_salary_hold(hold_name: str, release_date: str, release_reason: str):
    """
    Called from the Release dialog on the list / form view.
    Cancel → amend → Released → submit to keep full audit trail.
    """
    hold = frappe.get_doc("Employee Salary Hold", hold_name)

    if hold.docstatus != 1:
        frappe.throw("Only submitted records can be released.")

    if hold.status == "Released":
        frappe.throw("This hold is already released.")

    hold.cancel()
    amended = frappe.copy_doc(hold)
    amended.amended_from = hold.name
    amended.status = "Released"
    amended.release_date = release_date
    amended.release_reason = release_reason
    amended.insert()
    amended.submit()

    return amended.name


@frappe.whitelist()
def get_hold_status(employee: str):
    """Return current hold record for an employee if any."""
    hold = frappe.db.get_value(
        "Employee Salary Hold",
        {"employee": employee, "status": "On Hold", "docstatus": 1},
        ["name", "hold_date", "hold_reason"],
        as_dict=True,
    )
    return hold or {}


@frappe.whitelist()
def is_employee_on_hold(employee: str) -> bool:
    """Quick boolean check — used in Salary Slip creation to gate processing."""
    return bool(
        frappe.db.exists(
            "Employee Salary Hold",
            {"employee": employee, "status": "On Hold", "docstatus": 1},
        )
    )


@frappe.whitelist()
def get_salary_slips_for_employee(employee: str, month: str, year: str):
    """
    Return salary slips for the given employee + month + year.
    Includes Draft (docstatus=0) and Submitted (docstatus=1).
    Called from JS to show clickable chips below the salary_slip field.
    """
    if not employee or not month or not year:
        return []

    month_map = {
        "January": 1, "February": 2, "March": 3, "April": 4,
        "May": 5, "June": 6, "July": 7, "August": 8,
        "September": 9, "October": 10, "November": 11, "December": 12
    }
    month_num = month_map.get(month)
    if not month_num:
        return []

    start_date = f"{year}-{month_num:02d}-01"

    slips = frappe.db.sql("""
        SELECT
            name,
            docstatus,
            net_salary,
            start_date,
            end_date
        FROM `tabSalary Slip`
        WHERE employee   = %(employee)s
          AND start_date = %(start_date)s
          AND docstatus  IN (0, 1)
        ORDER BY modified DESC
    """, {"employee": employee, "start_date": start_date}, as_dict=True)

    status_label = {0: "Draft", 1: "Submitted"}
    for s in slips:
        s["status_label"] = status_label.get(s.docstatus, "Unknown")

    return slips