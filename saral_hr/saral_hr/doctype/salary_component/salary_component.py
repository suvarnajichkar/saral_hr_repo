import frappe
from frappe.model.document import Document
from frappe.utils import flt, now

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

class SalaryComponent(Document):
    def validate(self):
        if self.is_special_component:
            # Save amounts to a temp attribute before clearing the table
            self._month_amounts = {}
            for row in self.enter_amount_according_to_months:
                if row.month in MONTHS and row.month not in self._month_amounts:
                    self._month_amounts[row.month] = flt(row.amount)

            # Clear child table so Frappe saves NOTHING for it
            self.enter_amount_according_to_months = []

    def on_update(self):
        if self.is_special_component:
            self._write_months_to_db()

    def after_insert(self):
        if self.is_special_component:
            self._write_months_to_db()

    def _write_months_to_db(self):
        amounts = getattr(self, "_month_amounts", {})

        # Wipe all existing child rows with raw SQL
        frappe.db.sql("""
            DELETE FROM `tabSpecial Salary Component`
            WHERE parent = %s
        """, self.name)

        # Insert all 12 months directly — no Frappe ORM, no name collision possible
        ts = now()
        user = frappe.session.user
        for idx, month in enumerate(MONTHS):
            frappe.db.sql("""
                INSERT INTO `tabSpecial Salary Component`
                    (name, creation, modified, modified_by, owner,
                     docstatus, parent, parentfield, parenttype,
                     idx, month, amount)
                VALUES (%s, %s, %s, %s, %s,
                        0, %s, %s, %s,
                        %s, %s, %s)
            """, (
                f"{self.name}-{month}",
                ts, ts, user, user,
                self.name,
                "enter_amount_according_to_months",
                "Salary Component",
                idx + 1,
                month,
                amounts.get(month, 0.0)
            ))

        frappe.db.commit()