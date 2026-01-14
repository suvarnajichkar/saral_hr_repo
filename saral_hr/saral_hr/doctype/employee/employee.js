frappe.ui.form.on("Employee", {
    refresh(frm) {
        set_employee_name(frm);
    },
    first_name(frm) { set_employee_name(frm); },
    middle_name(frm) { set_employee_name(frm); },
    last_name(frm) { set_employee_name(frm); }
});

function set_employee_name(frm) {
    let first = frm.doc.first_name || "";
    let middle = frm.doc.middle_name || "";
    let last = frm.doc.last_name || "";

    let full_name = [first, middle, last].filter(Boolean).join(" ");
    
    // Use your actual fieldname: "employee"
    frm.set_value("employee", full_name);
}





frappe.ui.form.on("Employee", {
    refresh(frm) {
        setTimeout(() => {
            frm.trigger("render_employee_image");
        }, 500);
    },

    employee_image(frm) {
        setTimeout(() => {
            frm.trigger("render_employee_image");
        }, 300);
    },

    render_employee_image(frm) {
        const sidebar = frm.page.sidebar;
        if (!sidebar) {
            console.error("Sidebar not found");
            return;
        }

        sidebar.find(".employee-image-section").remove();

        const image_url = frm.doc.employee_image;

        let html = `
            <div class="employee-image-section" style="padding:12px;text-align:center; position:relative; width: 120px; margin:auto;">
                <div style="
                    width:120px;
                    height:120px;
                    border-radius:50%;
                    overflow:hidden;
                    background:#f5f5f5;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:48px;
                    color:#888;
                    cursor:pointer;
                    position: relative;
                ">
                    ${image_url ? `<img src="${image_url}" style="width:100%;height:100%;object-fit:cover;">` : (frm.doc.employee || "E").charAt(0).toUpperCase()}
                    <div class="image-upload-overlay" style="
                        position:absolute;
                        top:0; left:0; right:0; bottom:0;
                        background:rgba(0,0,0,0.5);
                        color:#fff;
                        font-size:14px;
                        display:flex;
                        justify-content:center;
                        align-items:center;
                        opacity:0;
                        transition: opacity 0.3s;
                        border-radius:50%;
                    ">
                        Change
                    </div>
                    <input type="file" accept="image/*" style="display:none;" />
                </div>
            </div>
        `;

        sidebar.prepend(html);

        // Show overlay on hover
        const container = sidebar.find(".employee-image-section > div");
        container.on("mouseenter", () => {
            container.find(".image-upload-overlay").css("opacity", "1");
        });
        container.on("mouseleave", () => {
            container.find(".image-upload-overlay").css("opacity", "0");
        });

        // Trigger file input on click
        container.on("click", () => {
            container.find("input[type=file]").click();
        });

        // Handle file selection and upload
        container.find("input[type=file]").on("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Upload file to Frappe server
            frappe.upload.upload_file({
                file_obj: file,
                folder: "Home/Attachments",
                onerror: (err) => {
                    frappe.msgprint(`Upload failed: ${err.message || err}`);
                },
                onprogress: (percent) => {
                    // Optional: show progress
                },
                callback: (r) => {
                    if (r.message && r.message.file_url) {
                        frm.set_value("employee_image", r.message.file_url);
                        frm.save();
                    }
                }
            });
        });

        console.log("IMAGE INJECTED");
    }
});






