import frappe
from frappe.model.document import Document
from frappe import _


class HolidayList(Document):

    def validate(self):
        self.validate_date_range()
        self.validate_holiday_dates()
        self.validate_duplicate_holidays()

    def validate_date_range(self):
        """From Date should be before or equal to To Date"""
        if self.from_date and self.to_date and self.from_date > self.to_date:
            frappe.throw(
                _("To Date cannot be earlier than From Date.")
            )

    def validate_holiday_dates(self):
        """Holiday dates must fall within From Date and To Date"""
        for row in self.holidays:
            if row.holiday_date < self.from_date or row.holiday_date > self.to_date:
                frappe.throw(
                    _("Holiday date {0} must be between {1} and {2}.").format(
                        row.holiday_date, self.from_date, self.to_date
                    )
                )

    def validate_duplicate_holidays(self):
        """No duplicate holiday dates allowed"""
        seen_dates = set()

        for row in self.holidays:
            if row.holiday_date in seen_dates:
                frappe.throw(
                    _("Duplicate holiday date found: {0}").format(row.holiday_date)
                )
            seen_dates.add(row.holiday_date)
