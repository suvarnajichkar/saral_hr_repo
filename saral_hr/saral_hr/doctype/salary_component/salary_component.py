import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime
from frappe import generate_hash

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]


class SalaryComponent(Document):

    def validate(self):
        if self.is_special_component:
            self._rebuild_month_table()
        else:
            # If unchecked, wipe the table
            self.enter_amount_according_to_months = []

    def _rebuild_month_table(self):
        # Step 1: preserve any amounts the user typed
        existing = {}
        for row in (self.enter_amount_according_to_months or []):
            if row.month and row.month not in existing:
                existing[row.month] = flt(row.amount)

        # Step 2: wipe via raw SQL so there are zero stale rows in DB
        if not self.is_new():
            frappe.db.sql("""
                DELETE FROM `tabSpecial Salary Component`
                WHERE parent = %s
            """, self.name)

        # Step 3: rebuild exactly 12 rows with guaranteed-unique names
        self.enter_amount_according_to_months = []
        for idx, month in enumerate(MONTHS, start=1):
            # generate_hash gives a random unique string — no collision possible
            child_name = f"{self.name}-{month}-{generate_hash(length=6)}"
            row = self.append("enter_amount_according_to_months", {
                "name":   child_name,
                "month":  month,
                "amount": existing.get(month, 0.0),
                "idx":    idx,
            })