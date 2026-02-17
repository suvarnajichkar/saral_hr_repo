import frappe
import datetime
from frappe.model.document import Document
from frappe import _


class CompanyLink(Document):

    def autoname(self):
        if self.employee:
            self.name = self.employee

    def before_insert(self):
        self.handle_employee_transfer()

    def validate(self):
        self.sync_holiday_list_from_company()
        self.validate_left_date()

    def handle_employee_transfer(self):
        if not self.employee:
            return

        if not self.date_of_joining:
            frappe.throw(
                _("Please set the <b>Date of Joining</b> before saving. "
                  "It is needed to calculate the leaving date for the previous company record.")
            )

        # Find existing active record (name starts with employee ID)
        existing = frappe.db.sql("""
            SELECT name, company, employee, date_of_joining
            FROM `tabCompany Link`
            WHERE name LIKE %(pattern)s
              AND is_active = 1
            LIMIT 1
        """, {"pattern": "{0}%".format(self.employee)}, as_dict=True)

        if not existing:
            self.is_active = 1
            return

        old_record = existing[0]
        old_name = old_record["name"]

        # Calculate left_date = new joining date - 1 day
        left_date = (
            frappe.utils.getdate(self.date_of_joining)
            - datetime.timedelta(days=1)
        )

        # Only rename if the old record is NOT already an archived name
        # i.e. only rename if name == employee ID exactly (no suffix yet)
        if old_name == self.employee:
            # This is the first archive — rename to HR-EMP-00072-1
            suffix = self.get_next_archive_suffix(self.employee)
            new_archive_name = "{0}-{1}".format(self.employee, suffix)

            frappe.rename_doc(
                "Company Link",
                old_name,
                new_archive_name,
                force=True
            )
            frappe.db.commit()

            archive_name = new_archive_name
        else:
            # Already has a suffix (e.g. HR-EMP-00072-2), no rename needed
            archive_name = old_name

        # Update the archived record
        frappe.db.set_value(
            "Company Link",
            archive_name,
            {
                "is_active": 0,
                "left_date": left_date,
                "employee": self.employee  # always restore original employee ID
            }
        )
        frappe.db.commit()

        frappe.msgprint(
            _("Previous record at company {0} has been archived as {1} "
              "with leaving date {2}.").format(
                frappe.bold(old_record["company"]),
                frappe.bold(archive_name),
                frappe.bold(str(left_date))
            ),
            title=_("Employee Transferred"),
            indicator="blue"
        )

        self.is_active = 1

    def get_next_archive_suffix(self, employee):
        """
        Find the highest existing suffix for this employee and return next one.
        e.g. HR-EMP-00072-1 exists → return 2
             HR-EMP-00072-1 and HR-EMP-00072-2 exist → return 3
        """
        existing_archives = frappe.db.sql("""
            SELECT name FROM `tabCompany Link`
            WHERE name LIKE %(pattern)s
        """, {"pattern": "{0}-%".format(employee)}, as_dict=True)

        if not existing_archives:
            return 1

        # Extract suffix numbers and return max + 1
        suffixes = []
        for rec in existing_archives:
            parts = rec["name"].split("-")
            try:
                suffixes.append(int(parts[-1]))
            except ValueError:
                pass

        return max(suffixes) + 1 if suffixes else 1

    def sync_holiday_list_from_company(self):
        if not self.company:
            return

        company_values = frappe.db.get_value(
            "Company",
            self.company,
            ["default_holiday_list", "salary_calculation_based_on"],
            as_dict=True
        )

        if company_values:
            if company_values.default_holiday_list:
                self.holiday_list = company_values.default_holiday_list
            if company_values.salary_calculation_based_on:
                self.salary_calculation_based_on = company_values.salary_calculation_based_on

    def validate_left_date(self):
        if self.left_date and self.is_active:
            self.is_active = 0