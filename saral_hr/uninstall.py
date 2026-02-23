import frappe

def after_uninstall():
    delete_saral_hr_data()
    delete_roles()

def delete_saral_hr_data():
    # Child tables pehle delete karo
    doctypes = [
        # Child Tables
        "Variable Pay Detail Table",
        "Salary Details",
        "Special Salary Component",

        # Transactions
        "Variable Pay Assignment",
        "Salary Slip",
        "Salary Structure Assignment",
        "Leave Allocation",
        "Shift Assignment",
        "Attendance",

        # Semi-Masters
        "Salary Structure",
        "Salary Component",
        "Leave Types",
        "Shift Type",
        "Holiday",
        "Holiday List",

        # Masters
        "Employee",
        "Grade",
        "Designation",
        "Department",
        "Division",
        "Branch",
        "Category",
        "Bank Name",
        "Company Link",
        "Company",
    ]

    for dt in doctypes:
        try:
            records = frappe.get_all(dt, pluck="name")
            for record in records:
                frappe.delete_doc(dt, record, ignore_permissions=True, force=True)
            print(f"✅ {dt} data deleted.")
        except Exception as e:
            print(f"❌ Error deleting {dt}: {e}")

    frappe.db.commit()
    print("✅ Saral HR data deleted successfully.")

def delete_roles():
    roles = ["Saral HR Manager", "Saral HR User"]
    for role in roles:
        if frappe.db.exists("Role", role):
            frappe.delete_doc("Role", role, ignore_permissions=True)
    frappe.db.commit()
    print("✅ Saral HR Roles deleted.")
