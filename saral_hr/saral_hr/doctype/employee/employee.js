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





// frappe.ui.form.on("Employee", {
//     refresh(frm) {
//         setTimeout(() => {
//             frm.trigger("render_employee_image");
//         }, 500);
//     },

//     employee_image(frm) {
//         setTimeout(() => {
//             frm.trigger("render_employee_image");
//         }, 300);
//     },

//     render_employee_image(frm) {
//         const sidebar = frm.page.sidebar;
//         if (!sidebar) {
//             console.error("Sidebar not found");
//             return;
//         }

//         sidebar.find(".employee-image-section").remove();

//         const image_url = frm.doc.employee_image;

//         let html = `
//             <div class="employee-image-section" style="padding:12px;text-align:center; position:relative; width: 120px; margin:auto;">
//                 <div style="
//                     width:120px;
//                     height:120px;
//                     border-radius:50%;
//                     overflow:hidden;
//                     background:#f5f5f5;
//                     display:flex;
//                     align-items:center;
//                     justify-content:center;
//                     font-size:48px;
//                     color:#888;
//                     cursor:pointer;
//                     position: relative;
//                 ">
//                     ${image_url ? `<img src="${image_url}" style="width:100%;height:100%;object-fit:cover;">` : (frm.doc.employee || "E").charAt(0).toUpperCase()}
//                     <div class="image-upload-overlay" style="
//                         position:absolute;
//                         top:0; left:0; right:0; bottom:0;
//                         background:rgba(0,0,0,0.5);
//                         color:#fff;
//                         font-size:14px;
//                         display:flex;
//                         justify-content:center;
//                         align-items:center;
//                         opacity:0;
//                         transition: opacity 0.3s;
//                         border-radius:50%;
//                     ">
//                         Change
//                     </div>
//                     <input type="file" accept="image/*" style="display:none;" />
//                 </div>
//             </div>
//         `;

//         sidebar.prepend(html);

//         // Show overlay on hover
//         const container = sidebar.find(".employee-image-section > div");
//         container.on("mouseenter", () => {
//             container.find(".image-upload-overlay").css("opacity", "1");
//         });
//         container.on("mouseleave", () => {
//             container.find(".image-upload-overlay").css("opacity", "0");
//         });

//         // Trigger file input on click
//         container.on("click", () => {
//             container.find("input[type=file]").click();
//         });

//         // Handle file selection and upload
//         container.find("input[type=file]").on("change", (e) => {
//             const file = e.target.files[0];
//             if (!file) return;

//             // Upload file to Frappe server
//             frappe.upload.upload_file({
//                 file_obj: file,
//                 folder: "Home/Attachments",
//                 onerror: (err) => {
//                     frappe.msgprint(`Upload failed: ${err.message || err}`);
//                 },
//                 onprogress: (percent) => {
//                     // Optional: show progress
//                 },
//                 callback: (r) => {
//                     if (r.message && r.message.file_url) {
//                         frm.set_value("employee_image", r.message.file_url);
//                         frm.save();
//                     }
//                 }
//             });
//         });

//         console.log("IMAGE INJECTED");
//     }
// });




frappe.ui.form.on("Employee", {
    onload(frm) {
        create_sidebar_image(frm);
        update_sidebar_image(frm);
    },

    refresh(frm) {
        create_sidebar_image(frm);
        update_sidebar_image(frm);
    },

    employee_image(frm) {
        update_sidebar_image(frm);
    }
});


function create_sidebar_image(frm) {
    const sidebar = frm.page.sidebar;
    if (!sidebar) return;

    if (sidebar.find(".employee-image-section").length) return;

    let html = `
        <div class="employee-image-section" style="padding:12px;text-align:center;">
            <div class="employee-image-circle" style="
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
                position:relative;
                margin:auto;
            ">
                <img class="employee-img" src="" style="width:100%; height:100%; object-fit:cover; display:none;">
                <div class="employee-initial" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;"></div>
                <div class="image-upload-overlay" style="
                    position:absolute;
                    inset:0;
                    background:rgba(0,0,0,0.5);
                    color:#fff;
                    font-size:14px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    opacity:0;
                    pointer-events:none;
                    transition:opacity 0.2s;
                    border-radius:50%;
                ">Change</div>
                <input type="file" accept="image/*" style="display:none;">
            </div>
        </div>
    `;

    sidebar.prepend(html);

    const container = sidebar.find(".employee-image-circle");
    const overlay = container.find(".image-upload-overlay");
    const fileInput = container.find("input[type=file]");

    container.off("mouseenter mouseleave click").on({
        mouseenter: () => overlay.css({ opacity: 1, pointerEvents: "auto" }),
        mouseleave: () => overlay.css({ opacity: 0, pointerEvents: "none" }),
        click: () => {
            if (fileInput.length && fileInput[0]) {
                fileInput[0].click();  // use native click to avoid recursion
            }
        }
    });

    let isUploading = false;
   fileInput.off("change").on("change", (e) => {
    if (isUploading) return;

    const file = e.target.files[0];
    if (!file) return;

    isUploading = true;

    manual_upload(file, frm, fileInput, () => {
        isUploading = false;   // ✅ reset here
    });
});
}

function update_sidebar_image(frm) {
    const sidebar = frm.page.sidebar;
    if (!sidebar) return;

    const container = sidebar.find(".employee-image-circle");
    const img = container.find(".employee-img");
    const initial = container.find(".employee-initial");

    if (frm.doc.employee_image) {
        const src = frm.doc.employee_image + "?t=" + Date.now();

        img.off("load").on("load", () => {
            img.show();
            initial.hide();
        });

        img.attr("src", src);
    } else {
        img.hide();
        initial
            .text((frm.doc.employee || "E").charAt(0).toUpperCase())
            .show();
    }
}

function manual_upload(file, frm, fileInput, done) {
    const data = new FormData();
    data.append("file", file);
    data.append("folder", "Home/Attachments");
    data.append("is_private", 0);

    fetch("/api/method/upload_file", {
        method: "POST",
        body: data,
        credentials: "same-origin",
        headers: {
            "X-Frappe-CSRF-Token": frappe.csrf_token
        }
    })
    .then(res => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
    })
    .then(r => {
        if (!r.message || !r.message.file_url) {
            throw new Error("No file URL");
        }

        const file_url = r.message.file_url;

        // instant UI
        frm.doc.employee_image = file_url;
        update_sidebar_image(frm);

        // silent save
        return frappe.call({
            method: "frappe.client.set_value",
            args: {
                doctype: frm.doctype,
                name: frm.doc.name,
                fieldname: "employee_image",
                value: file_url
            }
        });
    })
    .then(() => {
        fileInput[0].value = "";
        done();   // ✅ upload finished
    })
    .catch(err => {
        console.error(err);
        frappe.msgprint("Image upload failed");
        done();   // ✅ even on error, reset
    });
}
