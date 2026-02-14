import frappe
from frappe.model.document import Document
from frappe import _


class CompanyLink(Document):

    def before_insert(self):
        self.handle_employee_transfer()

    def validate(self):
        self.sync_holiday_list_from_company()
        self.validate_left_date()

    def handle_employee_transfer(self):
        """
        Before inserting a new Company Link:
        1. Find existing active record for this employee
        2. Archive it by renaming to HR-EMP-00001-1, -2 etc.
        3. Set this new record's name = employee ID
        """
        if not self.employee:
            return

        # Find existing active record
        existing = frappe.db.sql("""
            SELECT name, company, date_of_joining
            FROM `tabCompany Link`
            WHERE employee = %(employee)s
              AND is_active = 1
            LIMIT 1
        """, {"employee": self.employee}, as_dict=True)

        if existing:
            old_record = existing[0]

            # Find next archive suffix
            suffix = self.get_next_archive_suffix(self.employee)
            new_archive_name = "{0}-{1}".format(self.employee, suffix)

            # Set left_date on old record = date_of_joining of new record - 1 day
            left_date = None
            if self.date_of_joining:
                import datetime
                left_date = (
                    frappe.utils.getdate(self.date_of_joining)
                    - datetime.timedelta(days=1)
                )

            # Rename old active record to archived name
            frappe.rename_doc(
                "Company Link",
                old_record["name"],
                new_archive_name,
                force=True
            )

            # Update the archived record
            frappe.db.set_value(
                "Company Link",
                new_archive_name,
                {
                    "is_active": 0,
                    "left_date": left_date
                }
            )

            frappe.msgprint(
                _("Previous record at company {0} archived as {1}").format(
                    frappe.bold(old_record["company"]),
                    frappe.bold(new_archive_name)
                ),
                indicator="blue"
            )

        # Set this new record's name = employee ID
        self.name = self.employee
        self.is_active = 1

    def get_next_archive_suffix(self, employee):
        """
        Find how many archived records exist for this employee
        and return the next suffix number
        e.g. HR-EMP-00001-1 exists → return 2
        """
        existing_archives = frappe.db.sql("""
            SELECT name FROM `tabCompany Link`
            WHERE name LIKE %(pattern)s
        """, {"pattern": "{0}-%".format(employee)}, as_dict=True)

        return len(existing_archives) + 1

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