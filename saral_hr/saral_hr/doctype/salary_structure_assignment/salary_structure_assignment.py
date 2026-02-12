# Copyright (c) 2026, sj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from datetime import date


FAR_FUTURE = date(9999, 12, 31)


class SalaryStructureAssignment(Document):
    def validate(self):
        check_overlap(
            employee         = self.employee,
            from_date        = self.from_date,
            to_date          = self.to_date,
            employee_name    = self.employee_name,
            current_name     = self.name,
            throw_if_overlap = True,
        )


@frappe.whitelist()
def check_overlap(
    employee,
    from_date,
    to_date          = None,
    employee_name    = None,
    current_name     = None,
    throw_if_overlap = False,
):
    """
    Date range is global — no two assignments (any employee) can use
    the same from_date or to_date if it falls inside an existing range.

    Two independent checks:
      1. Does from_date fall inside any existing record's range?  -> error
      2. Does to_date fall inside any existing record's range?    -> error
    """
    if not from_date:
        return None

    filters = {
        "docstatus": ["!=", 2],   # ignore cancelled docs
    }

    # Exclude current record when editing
    if current_name:
        filters["name"] = ["!=", current_name]

    overlapping = frappe.db.get_all(
        "Salary Structure Assignment",
        filters=filters,
        fields=["name", "from_date", "to_date", "employee_name", "employee"],
    )

    for record in overlapping:
        b_start = frappe.utils.getdate(record.from_date)
        b_end   = frappe.utils.getdate(record.to_date) if record.to_date else FAR_FUTURE

        a_start = frappe.utils.getdate(from_date)
        a_end   = frappe.utils.getdate(to_date) if to_date else None

        # Check 1: from_date falls inside an existing record's range
        from_date_conflict = b_start <= a_start <= b_end

        # Check 2: to_date falls inside an existing record's range
        to_date_conflict = (a_end is not None) and (b_start <= a_end <= b_end)

        if from_date_conflict or to_date_conflict:

            rec_employee = record.employee_name or record.employee

            if throw_if_overlap:
                frappe.throw(
                    title="Date Range Already in Use",
                    msg=(
                        f"This date range overlaps with an existing Salary Structure Assignment.<br><br>"
                        f"Existing Record: "
                        f"<a href='/app/salary-structure-assignment/{record.name}' target='_blank'>"
                        f"<b>{record.name}</b></a> "
                        f"({rec_employee})<br>"
                        f"Period: <b>{record.from_date}</b> "
                        f"to <b>{record.to_date or 'Ongoing'}</b>"
                    ),
                    exc=frappe.DuplicateEntryError,
                )
            else:
                return {
                    "name":          record.name,
                    "from_date":     str(record.from_date),
                    "to_date":       str(record.to_date) if record.to_date else None,
                    "employee_name": rec_employee,
                }

    return None