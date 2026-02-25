import frappe, json, calendar
from frappe import _
from frappe.utils import flt, getdate, add_months
from frappe.utils.pdf import get_pdf

MONTH_MAP = {"January":1,"February":2,"March":3,"April":4,"May":5,"June":6,
             "July":7,"August":8,"September":9,"October":10,"November":11,"December":12}

PT_SLABS = [
    {"label":"Upto Rs. 2,000",          "min":0,     "max":2000,  "rate":0},
    {"label":"Rs. 2,001 to Rs. 2,500",  "min":2001,  "max":2500,  "rate":0},
    {"label":"Rs. 2,501 to Rs. 3,500",  "min":2501,  "max":3500,  "rate":60},
    {"label":"Rs. 3,501 to Rs. 7,500",  "min":3501,  "max":7500,  "rate":120},
    {"label":"Rs. 7,501 to Rs. 10,000", "min":7501,  "max":10000, "rate":175},
    {"label":"Above Rs. 10,000",        "min":10001, "max":None,  "rate":200},
]

PF_WAGE_CEILING = 15000.0

EARNING_COMPONENTS = [
    ("Basic","BASIC"),("Dearness Allowance","DA"),("House Rent Allowance","HRA"),
    ("Conveyance Allowance","CONV"),("Medical Allowance","MED"),("Education Allowance","EDU"),
    ("Other Allowance","OA"),("Variable Pay","VAR"),("Arrears","ARREARS"),
]

DEDUCTION_COMPONENTS = [
    ("Employee -  PF","PF"),("Employer -  PF","EPF"),("Employee - ESIC","ESI"),
    ("Employer -  ESIC","EESI"),("Professional Tax","PT"),
    ("Employee -Labour Welfare Fund","Employee - LWF"),("Employer - Labour Welfare Fund","Employer - LWF"),
    ("Employee -Bonus","BONUS"),("Employer - Bonus","Employer - bonus"),
    ("Employer - Gratuity","GRAT"),("Loan","Loan"),("Advance","ADV"),
    ("Retention","RET"),("Other Deduction - 1","OD -1"),
]

REPORTS = [
    "bank_advice","educational_allowance","esi_register","labour_welfare_fund",
    "professional_tax","provident_fund","retention_deposit","salary_summary",
    "salary_summary_individual","transaction_checklist","variable_pay","monthly_attendance",
]

REPORT_LABELS = {
    "bank_advice":"Bank Advice","educational_allowance":"Educational Allowance Register",
    "esi_register":"ESI Register","labour_welfare_fund":"Labour Welfare Fund Register",
    "professional_tax":"Professional Tax Register","provident_fund":"Provident Fund Register",
    "retention_deposit":"Retention Deposit Register","salary_summary":"Salary Summary",
    "salary_summary_individual":"Salary Summary — Individual","transaction_checklist":"Transaction Checklist",
    "variable_pay":"Variable Pay Register","monthly_attendance":"Monthly Attendance Report",
}

def _parse_list(value):
    if not value: return []
    if isinstance(value, list): return value
    try:
        p = json.loads(value)
        if isinstance(p, list): return p
    except Exception: pass
    return [v.strip() for v in value.split(",") if v.strip()]

def _sanitize(abbr):
    return abbr.strip().lower().replace(" ","_").replace("-","_").replace("__","_")

def _fmt(val):
    if val is None or val == "" or val is False: return ""
    try: return f"{float(val):,.2f}"
    except (TypeError, ValueError): return str(val)

def _company_label(filters):
    c = _parse_list(filters.get("company"))
    return ", ".join(c) if c else (frappe.defaults.get_global_default("company") or "")

def _start_date(filters):
    m = MONTH_MAP.get(filters.get("month",""))
    y = filters.get("year","")
    return f"{y}-{m:02d}-01" if m and y else None

def _date_range(filters):
    m = MONTH_MAP.get(filters.get("month",""))
    y = int(filters.get("year",0) or 0)
    if not m or not y: return None, None
    return f"{y}-{m:02d}-01", f"{y}-{m:02d}-{calendar.monthrange(y,m)[1]:02d}"

def _base_conditions(filters, params, alias="ss"):
    conds = [f"{alias}.docstatus = 1"]
    sd = _start_date(filters)
    if sd:
        params["start_date"] = sd
        conds.append(f"{alias}.start_date = %(start_date)s")
    companies = _parse_list(filters.get("company"))
    if companies:
        params["companies"] = tuple(companies)
        conds.append(f"{alias}.company IN %(companies)s")
    employees = _parse_list(filters.get("employee"))
    if employees:
        params["employees"] = tuple(employees)
        conds.append(f"{alias}.employee IN %(employees)s")
    return " AND ".join(conds)

def _category_join(filters, params, emp_col="ss.employee"):
    cat = filters.get("category")
    if not cat: return ""
    params["category"] = cat
    return f"INNER JOIN `tabCompany Link` cl_cat ON cl_cat.name = {emp_col} AND cl_cat.category = %(category)s"

def _division_condition(filters, params):
    divs = _parse_list(filters.get("division"))
    if not divs: return ""
    params["divisions"] = tuple(divs)
    return " AND ss.employee IN (SELECT name FROM `tabCompany Link` WHERE division IN %(divisions)s OR department IN %(divisions)s)"

def _pt_slab(gross):
    for s in PT_SLABS:
        if s["max"] is None and gross >= s["min"]: return s
        elif s["max"] and s["min"] <= gross <= s["max"]: return s
    return PT_SLABS[0]

def _col(label, fieldname, fieldtype="Data", width=130, **kw):
    return {"label":_(label),"fieldname":fieldname,"fieldtype":fieldtype,"width":width,**kw}

def execute(filters=None):
    filters = filters or {}
    fn = ROUTER.get(filters.get("report_mode","bank_advice"))
    return fn(filters) if fn else ([], [])

@frappe.whitelist()
def print_single_report(filters):
    if isinstance(filters, str): filters = json.loads(filters)
    mode = filters.get("report_mode","bank_advice")
    fn   = ROUTER.get(mode)
    if not fn: frappe.throw(f"Unknown report mode: {mode}")
    cols, data = fn(filters)
    html = _build_print_html([{"title":REPORT_LABELS.get(mode,mode),"columns":cols,"data":data,"mode":mode}],
                             _company_label(filters), filters.get("month",""), filters.get("year",""))
    page_size = "A3" if mode == "monthly_attendance" else "A4"
    return _save_pdf(html, f"Payroll_{mode}", page_size)


@frappe.whitelist()
def get_all_reports_data(filters):
    if isinstance(filters, str): filters = json.loads(filters)

    out = {}
    results = []

    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def run_report(mode):
            fn = ROUTER.get(mode)
            if not fn:
                return mode, {"columns": [], "result": []}
            try:
                frappe.db.connect()
                cols, data = fn(dict(filters, report_mode=mode))
                return mode, {"columns": cols, "result": data}
            except Exception:
                frappe.log_error(f"Error in get_all_reports_data (parallel): {mode}", "Payroll Report")
                return mode, {"columns": [], "result": []}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(run_report, mode): mode for mode in REPORTS}
            for future in as_completed(futures):
                mode, result = future.result()
                out[mode] = result

    except Exception:
        for mode in REPORTS:
            fn = ROUTER.get(mode)
            if not fn:
                out[mode] = {"columns": [], "result": []}
                continue
            try:
                cols, data = fn(dict(filters, report_mode=mode))
                out[mode] = {"columns": cols, "result": data}
            except Exception:
                frappe.log_error(f"Error in get_all_reports_data: {mode}", "Payroll Report")
                out[mode] = {"columns": [], "result": []}

    return out


@frappe.whitelist()
def print_all_reports(filters):
    if isinstance(filters, str): filters = json.loads(filters)
    company, month, year = _company_label(filters), filters.get("month",""), filters.get("year","")
    sections = []
    for mode in REPORTS:
        fn = ROUTER.get(mode)
        if not fn: continue
        try: cols, data = fn(dict(filters, report_mode=mode))
        except Exception:
            frappe.log_error(f"Error running report {mode}", "Payroll Print All")
            cols, data = [], []
        sections.append({"title":REPORT_LABELS.get(mode,mode),"columns":cols,"data":data,"mode":mode})
    return _save_pdf(_build_print_html(sections, company, month, year), "Payroll_All_Reports")


def _save_pdf(html, name_prefix, page_size="A4"):
    pdf = get_pdf(html, options={
        "page-size":page_size,"orientation":"Landscape",
        "margin-top":"8mm","margin-right":"6mm","margin-bottom":"8mm","margin-left":"6mm",
        "encoding":"UTF-8","no-outline":None,
    })
    ts       = frappe.utils.now_datetime().strftime("%Y%m%d_%H%M%S")
    filename = f"{name_prefix}_{ts}.pdf"
    with open(frappe.utils.get_files_path(filename, is_private=0), "wb") as f:
        f.write(pdf)
    doc = frappe.get_doc({"doctype":"File","file_name":filename,"is_private":0,"file_url":f"/files/{filename}"})
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.file_url

_BASE_CSS = """<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:8px;color:#000}
.report-section{page-break-after:always;padding:8px}
.report-section:last-child{page-break-after:avoid}
.rpt-header{text-align:center;border-bottom:1.5px solid #000;padding-bottom:6px;margin-bottom:8px}
.rpt-header .co-name{font-size:12px;font-weight:700;text-transform:uppercase}
.rpt-header .rpt-title{font-size:10px;font-weight:700;margin-top:3px}
.rpt-header .rpt-period{font-size:8px;color:#444;margin-top:2px}
.rpt-tbl{width:100%;border-collapse:collapse;margin-top:6px;font-size:7.5px}
.rpt-tbl th{border:1px solid #000;padding:3px 4px;text-align:center;font-size:7px;font-weight:700;background:#e8e8e8;white-space:nowrap}
.rpt-tbl td{border:1px solid #ccc;padding:2.5px 4px}
.rpt-tbl .r{text-align:right}.rpt-tbl .c{text-align:center}
.rpt-tbl tr.tot td{border-top:1.5px solid #000;border-bottom:1.5px solid #000;font-weight:700;background:#f0f0f0}
.rpt-tbl tr:nth-child(even):not(.tot){background:#fafafa}
.ss-wrap{display:table;width:100%;border-spacing:6px 0}
.ss-col{display:table-cell;width:50%;vertical-align:top}
.ss-head{font-size:8px;font-weight:700;text-align:center;border:1px solid #000;background:#e8e8e8;padding:3px}
.ss-gt{display:flex;justify-content:space-between;border:1px solid #000;background:#d8d8d8;padding:3px 5px;font-size:8px;font-weight:700}
.ss-other-head{font-size:8px;font-weight:700;border:1px solid #000;background:#e8e8e8;padding:3px 5px;margin-top:8px}
.att-P{color:#1a6e3c;font-weight:700}.att-A{color:#b02020;font-weight:700}
.att-WO{color:#5a0f8a;font-weight:700}.att-H{color:#1045a0;font-weight:700}
.att-LWP{color:#a04800;font-weight:700}.att-HD{color:#7a5500;font-weight:700}
.sig-strip{display:flex;justify-content:space-between;margin-top:30px}
.sig-box{text-align:center;width:150px}
.sig-line{border-top:1px solid #000;margin-bottom:3px}
.sig-label{font-size:7.5px;color:#555}
</style>"""


def _build_print_html(sections, company, month, year):
    parts = []
    for s in sections:
        inner = _render_section(s["mode"], s["columns"], s["data"])
        sigs  = "".join(f'<div class="sig-box"><div class="sig-line"></div><div class="sig-label">{l}</div></div>'
                        for l in ["Prepared By","Checked By","Authorised Signatory"])
        shell = f"""<div class="rpt-header">
  <div class="co-name">{company}</div>
  <div class="rpt-title">{s["title"]}</div>
  <div class="rpt-period">For the Month of {month} {year}</div>
</div>{inner}<div class="sig-strip">{sigs}</div>"""
        parts.append(f'<div class="report-section">{shell}</div>')
    return f"<!DOCTYPE html><html><head><meta charset='UTF-8'>{_BASE_CSS}</head><body>{''.join(parts)}</body></html>"


def _render_section(mode, columns, data):
    return {
        "professional_tax": _render_pt,
        "provident_fund":   _render_pf,
        "salary_summary":   _render_salary_summary,
        "monthly_attendance": _render_attendance,
    }.get(mode, _render_generic)(columns, data)


def _tbl(thead, rows):
    return f'<table class="rpt-tbl"><thead>{thead}</thead><tbody>{"".join(rows)}</tbody></table>'

def _thead(columns):
    return "<tr>" + "".join(f'<th>{c.get("label","")}</th>' for c in columns) + "</tr>"

def _td_val(c, val, skip=False):
    if skip or val is None or val == "": return "<td></td>"
    if c.get("fieldtype") in ("Float","Currency","Int","Percent"):
        return f'<td class="r">{_fmt(val)}</td>'
    return f'<td>{val}</td>'


def _render_generic(columns, data):
    if not data:
        return '<p style="color:#888;padding:10px;font-size:8px;text-align:center;">No data</p>'
    rows = []
    for i, row in enumerate(data):
        is_tot = row.get("bold") or row.get("_row_type") in ("total","grand_total")
        cls    = ' class="tot"' if is_tot else (' style="background:#fafafa"' if i % 2 else "")
        cells  = "".join(_td_val(c, row.get(c.get("fieldname",""))) for c in columns)
        rows.append(f"<tr{cls}>{cells}</tr>")
    return _tbl(_thead(columns), rows)


def _render_pt(columns, data):
    if not data: return ""
    rows = []
    for row in data:
        is_tot = row.get("_row_type") == "total"
        cls    = ' class="tot"' if is_tot else ""
        cells  = "".join(_td_val(c, row.get(c["fieldname"]), skip=(is_tot and c["fieldname"]=="pt_rate")) for c in columns)
        rows.append(f"<tr{cls}>{cells}</tr>")
    return _tbl(_thead(columns), rows)


def _render_pf(columns, data):
    if not data: return ""
    SKIP = {"pf_no","uan_no","days","absent","date_of_joining","date_of_birth"}
    rows = []
    for row in data:
        is_tot = row.get("_row_type") == "total"
        cls    = ' class="tot"' if is_tot else ""
        cells = []
        for c in columns:
            fn, val = c["fieldname"], row.get(c["fieldname"])
            if is_tot and fn in SKIP: cells.append("<td></td>"); continue
            if val is None or val == "": cells.append("<td></td>"); continue
            if c.get("fieldtype") in ("Float","Currency","Int"): cells.append(f'<td class="r">{_fmt(val)}</td>')
            else: cells.append(f'<td class="c">{val}</td>')
        rows.append(f"<tr{cls}>{''.join(cells)}</tr>")
    return _tbl(_thead(columns), rows)


def _render_salary_summary(columns, data):
    if not data: return ""
    earn_rows = [r for r in data if r.get("_row_type")=="component" and r.get("description")]
    ded_rows  = [r for r in data if r.get("_row_type")=="component" and r.get("ded_description")]
    grand     = next((r for r in data if r.get("_row_type")=="grand_total"), {})
    others    = [r for r in data if r.get("_row_type")=="other"]

    TH = "border:1px solid #000;padding:3px 5px;background:#e8e8e8;font-weight:700;font-size:7px;"
    def mini_tbl(rows_html):
        return f'<table style="width:100%;border-collapse:collapse;font-size:7.5px;"><thead><tr><th style="{TH}text-align:left;">Description</th><th style="{TH}text-align:right;width:90px;">Amount</th></tr></thead><tbody>{rows_html}</tbody></table>'

    def tbl_rows(items, dk, ak):
        out = []
        for i, r in enumerate(items):
            bg   = ' style="background:#fafafa"' if i%2 else ""
            desc = r.get(dk) or ""
            amt  = r.get(ak)
            out.append(f"<tr{bg}><td>{desc}</td>{'<td class=r>'+_fmt(amt)+'</td>' if amt is not None and desc else '<td></td>'}</tr>")
        return "".join(out)

    return f"""<div class="ss-wrap">
  <div class="ss-col"><div class="ss-head">EARNINGS</div>{mini_tbl(tbl_rows(earn_rows,"description","amount"))}
    <div class="ss-gt"><span>Grand Total</span><span>{_fmt(grand.get("amount"))}</span></div></div>
  <div class="ss-col"><div class="ss-head">DEDUCTIONS</div>{mini_tbl(tbl_rows(ded_rows,"ded_description","ded_amount"))}
    <div class="ss-gt"><span>Grand Total</span><span>{_fmt(grand.get("ded_amount"))}</span></div></div>
</div><div class="ss-other-head">OTHER DETAILS</div>{mini_tbl(tbl_rows(others,"description","amount"))}"""


def _render_attendance(columns, data):
    if not data:
        return '<p style="color:#888;padding:10px;font-size:8px;text-align:center;">No data</p>'
    rows      = [r for r in data if not r.get("_is_total")]
    total_row = next((r for r in data if r.get("_is_total")), {})
    fixed     = [c for c in columns if c["fieldname"] in ("employee","employee_name")]
    day_cols  = [c for c in columns if c["fieldname"].startswith("day_")]
    summ_cols = [c for c in columns if c["fieldname"] in
                 ("working_days","present_days","half_days","absent_days","weekly_off_days","holiday_days","lwp_days","absent_lwp")]
    SC = {"P":"att-P","A":"att-A","WO":"att-WO","H":"att-H","LWP":"att-LWP","HD":"att-HD"}

    COL_STYLES = {
        "employee":      "width:80px;min-width:80px;text-align:left;",
        "employee_name": "width:110px;min-width:110px;text-align:left;",
    }
    SUMM_LABELS = {
        "working_days":"WD","present_days":"P","half_days":"HD","absent_days":"A",
        "weekly_off_days":"WO","holiday_days":"H","lwp_days":"LWP","absent_lwp":"A+LWP"
    }

    colgroup = "<colgroup>"
    for c in fixed:
        w = "80" if c["fieldname"]=="employee" else "110"
        colgroup += f'<col style="width:{w}px"/>'
    for _ in day_cols:
        colgroup += '<col style="width:10px"/>'
    for _ in summ_cols:
        colgroup += '<col style="width:22px"/>'
    colgroup += "</colgroup>"

    thead = "<tr>"
    for c in fixed:
        s = COL_STYLES.get(c["fieldname"],"")
        thead += f'<th style="{s}white-space:nowrap;">{c["label"]}</th>'
    for c in day_cols:
        thead += f'<th style="width:10px;padding:2px 1px;font-size:6px;">{c["label"]}</th>'
    for c in summ_cols:
        lbl = SUMM_LABELS.get(c["fieldname"], c["label"])
        thead += f'<th style="width:22px;padding:2px 2px;font-size:6.5px;background:#d0d8e8;">{lbl}</th>'
    thead += "</tr>"

    body = []
    for i, row in enumerate(rows):
        bg = ' style="background:#fafafa"' if i%2 else ""
        cells = ""
        for c in fixed:
            s = COL_STYLES.get(c["fieldname"],"")
            cells += f'<td style="{s}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{row.get(c["fieldname"],"")}</td>'
        for c in day_cols:
            v   = row.get(c["fieldname"],"-") or "-"
            cls = SC.get(v,"")
            cells += f'<td class="c {cls}" style="padding:1px;font-size:6px;">{v}</td>'
        for c in summ_cols:
            v = row.get(c["fieldname"])
            cells += f'<td class="c" style="padding:2px;font-size:6.5px;font-weight:600;">{v if v is not None else "-"}</td>'
        body.append(f"<tr{bg}>{cells}</tr>")

    tot = f'<td colspan="{len(fixed)}" style="font-weight:700;text-align:right;padding:2px 4px;">Total</td>'
    tot += "".join(f'<td style="padding:1px;font-size:6px;"></td>' for _ in day_cols)
    tot += "".join(f'<td class="c" style="padding:2px;font-size:6.5px;font-weight:700;">{total_row.get(c["fieldname"],"")}</td>' for c in summ_cols)
    body.append(f'<tr class="tot">{tot}</tr>')

    legend = "".join(f'<span style="margin-right:8px;"><b class="{cls}">{k}</b>&nbsp;–&nbsp;{lbl}</span>'
                     for k,cls,lbl in [("P","att-P","Present"),("A","att-A","Absent"),("WO","att-WO","Weekly Off"),
                                       ("H","att-H","Holiday"),("LWP","att-LWP","LWP"),("HD","att-HD","Half Day")])
    return (f'<div style="margin-bottom:4px;font-size:6.5px;">{legend}</div>'
            f'<table class="rpt-tbl" style="font-size:6px;table-layout:fixed;width:100%;">'
            f'{colgroup}<thead>{thead}</thead><tbody>{"".join(body)}</tbody></table>')


def _bank_advice(filters):
    cols = [_col("Employee ID","employee_id"),_col("Employee Name","employee_name",width=180),
            _col("IFSC Code","ifsc_code"),_col("Account Number","account_number",width=160),
            _col("Net Salary","net_salary","Float",130,precision=2),_col("Bank Name","bank_name",width=150)]
    params = {}
    start, end = _date_range(filters)
    if not start: return cols, []
    params.update(start_date2=start, end_date2=end)
    cond = "ss.docstatus=1 AND ss.start_date>=%(start_date2)s AND ss.end_date<=%(end_date2)s"
    companies = _parse_list(filters.get("company"))
    if companies: params["companies"]=tuple(companies); cond+=" AND ss.company IN %(companies)s"
    employees = _parse_list(filters.get("employee"))
    if employees: params["employees"]=tuple(employees); cond+=" AND ss.employee IN %(employees)s"
    catj, divc = _category_join(filters,params), _division_condition(filters,params)

    slips = frappe.db.sql(f"""
        SELECT ss.employee, ss.employee_name, ss.company, ss.net_salary,
               emp.bank_name, emp.account_number, emp.ifsc_code
        FROM `tabSalary Slip` ss
        LEFT JOIN `tabCompany Link` cl ON cl.name=ss.employee
        LEFT JOIN `tabEmployee` emp ON emp.name=cl.employee
        {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not slips: return cols, []

    bank_type  = filters.get("bank_type")
    co_list    = list({s.company for s in slips if s.company})
    home_map   = {r.name:(r.bank_name or "").strip().lower()
                  for r in frappe.db.get_all("Company",filters={"name":["in",co_list]},fields=["name","bank_name"])} if co_list else {}
    data, total = [], 0.0
    for s in slips:
        eb, hb = (s.bank_name or "").strip().lower(), home_map.get(s.company,"")
        if bank_type=="Home" and (not hb or eb!=hb): continue
        if bank_type=="Different" and hb and eb==hb: continue
        net=flt(s.net_salary,2); total+=net
        data.append({"employee_id":s.employee,"employee_name":s.employee_name,
                     "ifsc_code":s.ifsc_code or "-","account_number":s.account_number or "-",
                     "net_salary":net,"bank_name":s.bank_name or "-"})
    if data: data.append({"employee_id":"","employee_name":"Total","ifsc_code":"","account_number":"","net_salary":flt(total,2),"bank_name":"","bold":1})
    return cols, data


def _educational_allowance(filters):
    cols = [_col("Employee ID","employee_id"),_col("Employee Name","employee_name",width=200),
            _col("Educational Allowance","educational_allowance","Float",180,precision=2)]
    if not filters.get("company"): return cols, []
    params={}; cond=_base_conditions(filters,params); catj=_category_join(filters,params); divc=_division_condition(filters,params)
    slips = frappe.db.sql(f"""
        SELECT ss.name AS salary_slip, ss.employee, ss.employee_name, cl.employee AS employee_id
        FROM `tabSalary Slip` ss LEFT JOIN `tabCompany Link` cl ON cl.name=ss.employee
        {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not slips: return cols, []
    sn = tuple(s.salary_slip for s in slips)
    ea_map = {}
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip, sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='earnings' AND LOWER(sd.salary_component) LIKE '%%education%%' AND sd.amount>0", {"sn":sn}, as_dict=1):
        ea_map[r.salary_slip] = ea_map.get(r.salary_slip,0.0)+flt(r.amount)
    data, grand = [], 0.0
    for s in slips:
        ea=flt(ea_map.get(s.salary_slip,0))
        if not ea: continue
        grand+=ea; data.append({"employee_id":s.employee_id or s.employee,"employee_name":s.employee_name,"educational_allowance":ea})
    if data: data.append({"employee_id":"","employee_name":"Total","educational_allowance":flt(grand,2),"bold":1})
    return cols, data


def _esi_register(filters):
    cols = [_col("ESI Number","esic_number",width=150),_col("Employee ID","employee_id",width=120),
            _col("Employee Name","employee_name",width=200),_col("Days Paid","days_paid","Float",100,precision=2),
            _col("Gross Salary","gross_salary","Float",140,precision=2),_col("ESI Contribution","total_esi","Float",140,precision=2),
            _col("Join Date","date_of_joining","Date",110),_col("Birth Date","date_of_birth","Date",110)]
    if not filters.get("company"): return cols, []
    params={}; cond=_base_conditions(filters,params); catj=_category_join(filters,params); divc=_division_condition(filters,params)
    slips = frappe.db.sql(f"""
        SELECT ss.name AS salary_slip, ss.employee, ss.employee_name,
               ss.payment_days AS days_paid, ss.total_earnings AS gross_salary,
               emp.name AS employee_id, cl.date_of_joining, emp.date_of_birth, emp.esic_number
        FROM `tabSalary Slip` ss LEFT JOIN `tabEmployee` emp ON emp.name=ss.employee
        LEFT JOIN `tabCompany Link` cl ON cl.name=ss.employee
        {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not slips: return cols, []
    sn = tuple(s.salary_slip for s in slips)
    esi_map = {}
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip, sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='deductions' AND LOWER(sd.salary_component) LIKE '%%esic%%' AND sd.amount>0", {"sn":sn}, as_dict=1):
        esi_map[r.salary_slip] = esi_map.get(r.salary_slip,0)+flt(r.amount)
    data, gg, ge = [], 0.0, 0.0
    for s in slips:
        esi=flt(esi_map.get(s.salary_slip,0))
        if esi<=0: continue
        gg+=flt(s.gross_salary,2); ge+=esi
        data.append({"esic_number":s.esic_number or "-","employee_id":s.employee_id or s.employee,
                     "employee_name":s.employee_name,"days_paid":flt(s.days_paid,2),
                     "gross_salary":flt(s.gross_salary,2),"total_esi":esi,
                     "date_of_joining":s.date_of_joining,"date_of_birth":s.date_of_birth})
    if data: data.append({"esic_number":"","employee_id":"","employee_name":"Total","days_paid":"",
                          "gross_salary":flt(gg,2),"total_esi":flt(ge,2),"date_of_joining":"","date_of_birth":"","bold":1})
    return cols, data


def _labour_welfare_fund(filters):
    cols = [_col("Employee ID","employee_id"),_col("Employee Name","employee_name",width=200),
            _col("Net Salary","net_salary","Float",130,precision=2),_col("LWF Amount","lwf_amount","Float",120,precision=2)]
    if not filters.get("company"): return cols, []
    params={}; cond=_base_conditions(filters,params); catj=_category_join(filters,params); divc=_division_condition(filters,params)
    slips = frappe.db.sql(f"""
        SELECT ss.name AS salary_slip, ss.employee, ss.employee_name, ss.net_salary, cl.employee AS employee_id
        FROM `tabSalary Slip` ss LEFT JOIN `tabCompany Link` cl ON cl.name=ss.employee
        {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not slips: return cols, []
    sn = tuple(s.salary_slip for s in slips)
    lwf_map = {r.salary_slip:flt(r.lwf_amount) for r in frappe.db.sql(
        "SELECT sd.parent AS salary_slip, SUM(sd.amount) AS lwf_amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='deductions' AND LOWER(sd.salary_component) LIKE '%%welfare%%' AND sd.amount>0 GROUP BY sd.parent",
        {"sn":sn}, as_dict=1)}
    data, gn, gl = [], 0.0, 0.0
    for s in slips:
        lwf=flt(lwf_map.get(s.salary_slip,0))
        if lwf<=0: continue
        net=flt(s.net_salary,2); gn+=net; gl+=lwf
        data.append({"employee_id":s.employee_id or s.employee,"employee_name":s.employee_name,"net_salary":net,"lwf_amount":flt(lwf,2)})
    if data: data.append({"employee_id":"","employee_name":"Total","net_salary":flt(gn,2),"lwf_amount":flt(gl,2),"bold":1})
    return cols, data


def _professional_tax(filters):
    cols = [_col("Salary Range","salary_range",width=220),_col("PT Rate (Rs.)","pt_rate","Float",130,precision=2),
            _col("No. of Employees","employee_count","Int",150),_col("Total Earnings","total_earnings","Float",160,precision=2),
            _col("PT Amount (Rs.)","pt_amount","Float",150,precision=2)]
    empty = [{"salary_range":s["label"],"pt_rate":flt(s["rate"],2),"employee_count":0,"total_earnings":0.0,"pt_amount":0.0,"_row_type":"slab"} for s in PT_SLABS]
    empty.append({"salary_range":"Total","pt_rate":None,"employee_count":0,"total_earnings":0.0,"pt_amount":0.0,"bold":1,"_row_type":"total"})
    if not filters.get("company"): return cols, empty
    params={}; cond=_base_conditions(filters,params); catj=_category_join(filters,params); divc=_division_condition(filters,params)
    rows = frappe.db.sql(f"SELECT ss.employee AS employee_id, ss.total_earnings AS gross FROM `tabSalary Slip` ss {catj} WHERE {cond}{divc}", params, as_dict=1)
    if not rows: return cols, empty
    pp=dict(params,pt_like="%professional tax%")
    pt_map = {r.employee:flt(r.pt_amount) for r in frappe.db.sql(f"""
        SELECT ss.employee, SUM(sd.amount) AS pt_amount FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd ON sd.parent=ss.name AND sd.parenttype='Salary Slip' AND sd.parentfield='deductions' AND LOWER(sd.salary_component) LIKE %(pt_like)s
        {catj} WHERE {cond}{divc} GROUP BY ss.employee
    """, pp, as_dict=1)}
    sd = {s["label"]:{"rate":s["rate"],"count":0,"earnings":0.0,"amount":0.0} for s in PT_SLABS}
    for row in rows:
        pt=pt_map.get(row.employee_id,0.0)
        if pt<=0: continue
        gross=flt(row.gross,2); sl=_pt_slab(gross)
        sd[sl["label"]]["count"]+=1; sd[sl["label"]]["earnings"]+=gross; sd[sl["label"]]["amount"]+=pt
    data=[]; ge=gc=gp=0.0
    for s in PT_SLABS:
        info=sd[s["label"]]; ge+=info["earnings"]; gc+=info["count"]; gp+=info["amount"]
        data.append({"salary_range":s["label"],"pt_rate":flt(s["rate"],2),"employee_count":info["count"],
                     "total_earnings":flt(info["earnings"],2),"pt_amount":flt(info["amount"],2),"_row_type":"slab"})
    data.append({"salary_range":"Total","pt_rate":None,"employee_count":gc,"total_earnings":flt(ge,2),"pt_amount":flt(gp,2),"bold":1,"_row_type":"total"})
    return cols, data


def _provident_fund(filters):
    cols = [
        _col("PF No.","pf_no",width=110),_col("UAN No.","uan_no",width=110),
        _col("Employee ID","employee_id",width=120),_col("Employee Name","employee_name",width=180),
        _col("Days (LWP+ABS)","days","Float",80,precision=1),_col("Absent","absent","Float",65,precision=1),
        _col("Gross Salary","gross","Float",110,precision=2),_col("BS+DA","basic_da","Float",110,precision=2),
        _col("Emp PF 12%","emp_pf","Float",110,precision=2),_col("Er EPS 8.33%","employer_eps","Float",120,precision=2),
        _col("Er PF 3.67%","employer_pf","Float",120,precision=2),_col("Total","total_amount","Float",105,precision=2),
        _col("Non-Cont.","non_contrib","Float",100,precision=2),_col("Vol. PF","vol_pf","Float",80,precision=2),
        _col("Cumul. PF","cumul_pf","Float",95,precision=2),_col("Cumul. EPS","cumul_eps","Float",95,precision=2),
        _col("Total","total_amount2","Float",105,precision=2),_col("DOJ","date_of_joining","Date",105),_col("DOB","date_of_birth","Date",100),
    ]
    if not filters.get("company"): return cols, []
    params={}; cond=_base_conditions(filters,params); catj=_category_join(filters,params); divc=_division_condition(filters,params)
    slips = frappe.db.sql(f"""
        SELECT ss.name AS slip_name, ss.employee AS employee_id, ss.employee_name,
               ss.payment_days AS days, ss.absent_days AS absent, ss.total_earnings AS gross
        FROM `tabSalary Slip` ss {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not slips: return cols, []
    sn = tuple(s.slip_name for s in slips)
    eids = tuple(s.employee_id for s in slips)
    bda_map = {r.slip_name:flt(r.basic_da) for r in frappe.db.sql("""
        SELECT sd.parent AS slip_name, SUM(sd.amount) AS basic_da FROM `tabSalary Details` sd
        WHERE sd.parent IN %(sn)s AND sd.parenttype='Salary Slip' AND sd.parentfield='earnings'
          AND (LOWER(sd.salary_component) LIKE '%%basic%%' OR LOWER(sd.salary_component) LIKE '%%dearness%%' OR LOWER(sd.salary_component) LIKE '%% da')
        GROUP BY sd.parent
    """, {"sn":sn}, as_dict=1)}
    vpf_map = {r.slip_name:flt(r.vol_pf) for r in frappe.db.sql("""
        SELECT sd.parent AS slip_name, SUM(sd.amount) AS vol_pf FROM `tabSalary Details` sd
        WHERE sd.parent IN %(sn)s AND sd.parenttype='Salary Slip' AND sd.parentfield='deductions'
          AND LOWER(sd.salary_component) LIKE '%%voluntary%%' GROUP BY sd.parent
    """, {"sn":sn}, as_dict=1)}
    emp_map = {r.name:r for r in frappe.db.sql("""
        SELECT e.name, e.employee_pf_account AS pf_no, e.pf_uan_number AS uan_no, e.date_of_birth, cl.date_of_joining
        FROM `tabEmployee` e LEFT JOIN `tabCompany Link` cl ON cl.name=e.name WHERE e.name IN %(ids)s
    """, {"ids":eids}, as_dict=1)}
    data=[]; t={k:0.0 for k in ["gross","basic_da","emp_pf","er_eps","er_pf","total","nc","vpf","cpf","ceps","total2"]}
    for s in slips:
        emp=emp_map.get(s.employee_id, frappe._dict())
        gross=flt(s.gross,2); bda=flt(bda_map.get(s.slip_name,0.0),2)
        pfw=min(bda,PF_WAGE_CEILING); epf=flt(round(pfw*0.12),2)
        ereps=flt(round(epf*0.6944),2); erpf=flt(round(epf*0.3056),2)
        tota=flt(epf+epf,2); nc=flt(max(0.0,bda-PF_WAGE_CEILING),2)
        vpf=flt(vpf_map.get(s.slip_name,0.0),2); cpf=flt(epf+erpf,2)
        for k,v in [("gross",gross),("basic_da",bda),("emp_pf",epf),("er_eps",ereps),("er_pf",erpf),
                    ("total",tota),("nc",nc),("vpf",vpf),("cpf",cpf),("ceps",ereps),("total2",tota)]: t[k]+=v
        data.append({"pf_no":emp.get("pf_no") or "","uan_no":emp.get("uan_no") or "",
                     "employee_id":s.employee_id,"employee_name":s.employee_name,
                     "days":flt(s.days,1),"absent":flt(s.absent,1),"gross":gross,"basic_da":bda,
                     "emp_pf":epf,"employer_eps":ereps,"employer_pf":erpf,"total_amount":tota,"non_contrib":nc,
                     "vol_pf":vpf if vpf else None,"cumul_pf":cpf,"cumul_eps":ereps,"total_amount2":tota,
                     "date_of_joining":emp.get("date_of_joining") or "","date_of_birth":emp.get("date_of_birth") or "","_row_type":"detail"})
    data.append({"pf_no":"","uan_no":"","employee_id":"","employee_name":"Total","days":None,"absent":None,
                 "gross":flt(t["gross"],2),"basic_da":flt(t["basic_da"],2),"emp_pf":flt(t["emp_pf"],2),
                 "employer_eps":flt(t["er_eps"],2),"employer_pf":flt(t["er_pf"],2),"total_amount":flt(t["total"],2),
                 "non_contrib":flt(t["nc"],2),"vol_pf":flt(t["vpf"],2) if t["vpf"] else None,
                 "cumul_pf":flt(t["cpf"],2),"cumul_eps":flt(t["ceps"],2),"total_amount2":flt(t["total2"],2),
                 "date_of_joining":"","date_of_birth":"","bold":1,"_row_type":"total"})
    return cols, data


def _retention_deposit(filters):
    cols = [_col("Employee ID","employee_id",width=160),_col("Employee Name","employee_name",width=220),
            _col("Date of Joining","date_of_joining","Date",150),_col("Deduction Upto (3 Years)","ded_upto","Date",180),
            _col("Retention Deposit","retention_amount","Float",180,precision=2)]
    if not filters.get("company"): return cols, []
    params={"component":"Retention"}; cond=_base_conditions(filters,params)
    catj=_category_join(filters,params); divc=_division_condition(filters,params)
    rows = frappe.db.sql(f"""
        SELECT ss.employee AS employee_id, ss.employee_name, sd.amount AS retention_amount
        FROM `tabSalary Slip` ss
        INNER JOIN `tabSalary Details` sd ON sd.parent=ss.name AND sd.parenttype='Salary Slip'
            AND sd.parentfield='deductions' AND sd.salary_component=%(component)s AND sd.amount>0
        {catj} WHERE {cond}{divc} ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not rows: return cols, []
    cl_map = {r["name"]:r["date_of_joining"] for r in frappe.db.sql(
        "SELECT name, date_of_joining FROM `tabCompany Link` WHERE name IN %(ids)s",
        {"ids":tuple({r.employee_id for r in rows})}, as_dict=1)}
    data, grand = [], 0.0
    for row in rows:
        doj=cl_map.get(row.employee_id); ded_upto=None
        if doj:
            try: ded_upto=add_months(getdate(doj),36)
            except Exception: pass
        ret=flt(row.retention_amount,2); grand+=ret
        data.append({"employee_id":row.employee_id,"employee_name":row.employee_name,"date_of_joining":doj,"ded_upto":ded_upto,"retention_amount":ret})
    if data: data.append({"employee_id":"","employee_name":"Total","date_of_joining":None,"ded_upto":None,"retention_amount":flt(grand,2),"bold":1})
    return cols, data


def _salary_summary(filters):
    cols = [_col("Earnings — Description","description",width=250),_col("Earnings — Amount","amount","Float",160,precision=2),
            {"label":" ","fieldname":"spacer","fieldtype":"Data","width":40},
            _col("Deductions — Description","ded_description",width=250),_col("Deductions — Amount","ded_amount","Float",160,precision=2)]
    if not filters.get("company"): return cols, []
    params={}; conds=["ss.docstatus=1"]
    sd=_start_date(filters)
    if sd: params["start_date"]=sd; conds.append("ss.start_date=%(start_date)s")
    companies=_parse_list(filters.get("company"))
    if companies: params["companies"]=tuple(companies); conds.append("ss.company IN %(companies)s")
    cat=filters.get("category")
    if cat: params["category"]=cat; conds.append("ss.employee IN (SELECT name FROM `tabCompany Link` WHERE category=%(category)s)")
    divs=_parse_list(filters.get("division"))
    if divs: params["divisions"]=tuple(divs); conds.append("ss.employee IN (SELECT name FROM `tabCompany Link` WHERE division IN %(divisions)s OR department IN %(divisions)s)")
    where=" AND ".join(conds)

    def _comps(field, extra_join=""):
        return [r[0] for r in frappe.db.sql(f"""
            SELECT DISTINCT sd.salary_component FROM `tabSalary Slip` ss
            INNER JOIN `tabSalary Details` sd ON sd.parent=ss.name AND sd.parenttype='Salary Slip' AND sd.parentfield='{field}'
            {extra_join} WHERE {where} ORDER BY sd.salary_component
        """, params, as_list=1)]

    def _totals(field, extra_join=""):
        return {r.component:flt(r.total) for r in frappe.db.sql(f"""
            SELECT sd.salary_component AS component, SUM(sd.amount) AS total
            FROM `tabSalary Slip` ss
            INNER JOIN `tabSalary Details` sd ON sd.parent=ss.name AND sd.parenttype='Salary Slip' AND sd.parentfield='{field}'
            {extra_join} WHERE {where} GROUP BY sd.salary_component
        """, params, as_dict=1)}

    ded_join  = "INNER JOIN `tabSalary Component` sc ON sc.name=sd.salary_component AND sc.employer_contribution=0"
    earn_comp = _comps("earnings"); ded_comp=_comps("deductions",ded_join)
    earn_tot  = _totals("earnings"); ded_tot=_totals("deductions",ded_join)
    earn_rows = [(c,earn_tot.get(c,0.0)) for c in earn_comp]
    ded_rows  = [(c,ded_tot.get(c,0.0)) for c in ded_comp]
    ge,gd     = sum(v for _,v in earn_rows), sum(v for _,v in ded_rows)

    stats=(frappe.db.sql(f"""
        SELECT COUNT(DISTINCT ss.employee) AS total_employees, SUM(ss.net_salary) AS total_net_salary,
               SUM(ss.total_lwp) AS total_lwp, SUM(ss.absent_days) AS total_absent,
               SUM(ss.total_holidays) AS total_holidays, SUM(ss.payment_days) AS total_payment_days
        FROM `tabSalary Slip` ss WHERE {where}
    """, params, as_dict=1) or [{}])[0]

    data=[]
    for i in range(max(len(earn_rows),len(ded_rows),1)):
        ec,ea = earn_rows[i] if i<len(earn_rows) else ("",None)
        dc,da = ded_rows[i]  if i<len(ded_rows)  else ("",None)
        data.append({"description":ec,"amount":flt(ea,2) if ec else None,"spacer":"",
                     "ded_description":dc,"ded_amount":flt(da,2) if dc else None,"_row_type":"component"})
    data.append({"description":"Grand Total","amount":flt(ge,2),"spacer":"","ded_description":"Grand Total","ded_amount":flt(gd,2),"bold":1,"_row_type":"grand_total"})
    data.append({"description":"","amount":None,"spacer":"","ded_description":"","ded_amount":None,"_row_type":"separator"})
    data.append({"description":"Other Details","amount":None,"spacer":"","ded_description":"","ded_amount":None,"bold":1,"_row_type":"section_header"})
    for label, value in [("Total Employees",stats.get("total_employees") or 0),("Total Net Salary",flt(stats.get("total_net_salary"),2)),
                         ("Total LWP Days",flt(stats.get("total_lwp"),2)),("Total Absent Days",flt(stats.get("total_absent"),2)),
                         ("Total Holidays",flt(stats.get("total_holidays"),2)),("Total Payment Days",flt(stats.get("total_payment_days"),2))]:
        data.append({"description":label,"amount":value,"spacer":"","ded_description":"","ded_amount":None,"_row_type":"other"})
    return cols, data


def _salary_summary_individual(filters):
    cols = [_col("Employee ID","employee",width=120),_col("Employee Name","employee_name",width=180),
            _col("Payment Days","payment_days","Float",110,precision=2)]
    for lbl,abbr in EARNING_COMPONENTS:    cols.append(_col(f"{lbl} ({abbr})",f"earn_{_sanitize(abbr)}","Float",150,precision=2))
    for lbl,abbr in DEDUCTION_COMPONENTS: cols.append(_col(f"{lbl} ({abbr})",f"ded_{_sanitize(abbr)}","Float",150,precision=2))
    cols+=[_col("Total Earnings","total_earnings","Float",140,precision=2),
           _col("Total Deductions","total_deductions","Float",140,precision=2),
           _col("Net Salary","net_salary","Float",140,precision=2)]
    if not filters.get("company"): return cols, []
    params={}; start,end=_date_range(filters)
    if not start: return cols, []
    params.update(start_date=start,end_date=end)
    conds=["ss.docstatus=1","ss.start_date>=%(start_date)s","ss.end_date<=%(end_date)s"]
    companies=_parse_list(filters.get("company"))
    if companies: params["companies"]=tuple(companies); conds.append("ss.company IN %(companies)s")
    catj=""
    cat=filters.get("category")
    if cat: params["category"]=cat; catj="INNER JOIN `tabCompany Link` cl_cat ON cl_cat.name=ss.employee AND cl_cat.category=%(category)s"
    where=" AND ".join(conds)
    slips=frappe.db.sql(f"SELECT ss.name AS salary_slip, ss.employee, ss.employee_name, ss.payment_days, ss.net_salary FROM `tabSalary Slip` ss {catj} WHERE {where} ORDER BY ss.employee_name", params, as_dict=1)
    if not slips: return cols, []
    sn=[s["salary_slip"] for s in slips]
    emap={};dmap={}
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip,sd.salary_component,sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='earnings'",{"sn":sn},as_dict=1):
        emap.setdefault(r["salary_slip"],{})[r["salary_component"]]=r["amount"]
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip,sd.salary_component,sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='deductions'",{"sn":sn},as_dict=1):
        dmap.setdefault(r["salary_slip"],{})[r["salary_component"]]=r["amount"]
    data=[]; grand={f"earn_{_sanitize(a)}":0 for _,a in EARNING_COMPONENTS}
    grand.update({f"ded_{_sanitize(a)}":0 for _,a in DEDUCTION_COMPONENTS})
    grand.update(total_earnings=0,total_deductions=0,net_salary=0)
    for s in slips:
        se=emap.get(s["salary_slip"],{}); sd_=dmap.get(s["salary_slip"],{})
        row={"employee":s["employee"],"employee_name":s["employee_name"],"payment_days":flt(s["payment_days"],2),"net_salary":flt(s["net_salary"],2)}
        te=td=0.0
        for lbl,abbr in EARNING_COMPONENTS:
            amt=se.get(lbl)
            if amt is not None: v=flt(amt,2); row[f"earn_{_sanitize(abbr)}"]=v; te+=v; grand[f"earn_{_sanitize(abbr)}"]+=v
        row["total_earnings"]=flt(te,2); grand["total_earnings"]+=flt(te,2)
        for lbl,abbr in DEDUCTION_COMPONENTS:
            amt=sd_.get(lbl)
            if amt is not None: v=flt(amt,2); row[f"ded_{_sanitize(abbr)}"]=v; td+=v; grand[f"ded_{_sanitize(abbr)}"]+=v
        row["total_deductions"]=flt(td,2); grand["total_deductions"]+=flt(td,2)
        grand["net_salary"]+=flt(s["net_salary"],2); data.append(row)
    data.append({"employee":"","employee_name":"Total","payment_days":"","bold":1,**grand})
    return cols, data


def _transaction_checklist(filters):
    cols=[_col("Employee","employee",width=120),_col("Employee Name","employee_name",width=160),
          _col("Payment Days","payment_days","Float",110,precision=2),_col("LWP","total_lwp","Float",100,precision=2)]
    for lbl,abbr in EARNING_COMPONENTS:
        fn=f"earn_{_sanitize(abbr)}"
        cols.append(_col("Variable Pay (VAR %)",fn,"Data",150) if abbr=="VAR" else _col(f"{lbl} ({abbr})",fn,"Float",150,precision=2))
    for lbl,abbr in DEDUCTION_COMPONENTS: cols.append(_col(f"{lbl} ({abbr})",f"ded_{_sanitize(abbr)}","Float",150,precision=2))
    cols+=[_col("Total Earnings","total_earnings","Float",140,precision=2),
           _col("Total Deductions","total_deductions","Float",140,precision=2),_col("Net Salary","net_salary","Float",140,precision=2)]
    if not filters.get("company"): return cols, []
    params={}; start,end=_date_range(filters)
    if not start: return cols, []
    params.update(start_date=start,end_date=end)
    conds=["ss.docstatus=1","ss.start_date>=%(start_date)s","ss.end_date<=%(end_date)s"]
    companies=_parse_list(filters.get("company"))
    if companies: params["companies"]=tuple(companies); conds.append("ss.company IN %(companies)s")
    catj=_category_join(filters,params); divc=_division_condition(filters,params); where=" AND ".join(conds)
    slips=frappe.db.sql(f"SELECT ss.name AS salary_slip,ss.employee,ss.employee_name,ss.payment_days,ss.total_lwp,ss.net_salary FROM `tabSalary Slip` ss {catj} WHERE {where}{divc} ORDER BY ss.employee", params, as_dict=1)
    if not slips: return cols, []
    sn=[s["salary_slip"] for s in slips]; eids=[s["employee"] for s in slips]
    month,year=filters.get("month",""),filters.get("year","")
    vpa_name=f"{year} - {month}"; vp_map={}
    if frappe.db.exists("Variable Pay Assignment",vpa_name):
        vp_map={r.division:flt(r.percentage) for r in frappe.db.sql("SELECT division,percentage FROM `tabVariable Pay Detail Table` WHERE parent=%(v)s AND parenttype='Variable Pay Assignment'",{"v":vpa_name},as_dict=1)}
    div_map={r.company_link_name:r.division for r in frappe.db.sql("SELECT cl.name AS company_link_name,cl.division FROM `tabCompany Link` cl WHERE cl.name IN %(ids)s",{"ids":tuple(eids)},as_dict=1)} if eids else {}
    emap={};dmap={}
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip,sd.salary_component,sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='earnings'",{"sn":sn},as_dict=1):
        emap.setdefault(r["salary_slip"],{})[r["salary_component"]]=r["amount"]
    for r in frappe.db.sql("SELECT sd.parent AS salary_slip,sd.salary_component,sd.amount FROM `tabSalary Details` sd WHERE sd.parent IN %(sn)s AND sd.parentfield='deductions'",{"sn":sn},as_dict=1):
        dmap.setdefault(r["salary_slip"],{})[r["salary_component"]]=r["amount"]
    data=[]
    for s in slips:
        se=emap.get(s["salary_slip"],{}); sd_=dmap.get(s["salary_slip"],{}); div=div_map.get(s["employee"],"")
        row={"employee":s["employee"],"employee_name":s["employee_name"],"payment_days":s["payment_days"],"total_lwp":s["total_lwp"] or 0,"net_salary":s["net_salary"]}
        te=td=0.0
        for lbl,abbr in EARNING_COMPONENTS:
            if abbr=="VAR":
                pct=vp_map.get(div); row["earn_var"]=f"{pct}%" if pct is not None else "-"
                if (a:=se.get(lbl)): te+=a
            elif (a:=se.get(lbl)) is not None: row[f"earn_{_sanitize(abbr)}"]=a; te+=a
        row["total_earnings"]=te or None
        for lbl,abbr in DEDUCTION_COMPONENTS:
            if (a:=sd_.get(lbl)) is not None: row[f"ded_{_sanitize(abbr)}"]=a; td+=a
        row["total_deductions"]=td or None; data.append(row)
    return cols, data


def _variable_pay(filters):
    cols=[_col("Employee ID","employee_id",width=160),_col("Employee Name","employee_name",width=220),
          _col("Division","division",width=150),_col("Monthly Variable Pay","monthly_variable_pay","Float",180,precision=2),
          _col("Variable Pay %","variable_pay_percentage","Percent",130),_col("Variable Pay Amount","variable_pay_amount","Float",180,precision=2)]
    if not filters.get("company"): return cols, []
    params={"variable_like":"%variable%"}; cond=_base_conditions(filters,params)
    catj=_category_join(filters,params,emp_col="ss.employee"); divc=_division_condition(filters,params)
    rows=frappe.db.sql(f"""
        SELECT ss.name AS slip_name,ss.employee AS employee_id,ss.employee_name,cl.division,COALESCE(sd.amount,0) AS variable_pay_amount
        FROM `tabSalary Slip` ss LEFT JOIN `tabCompany Link` cl ON cl.name=ss.employee
        LEFT JOIN `tabSalary Details` sd ON sd.parent=ss.name AND sd.parenttype='Salary Slip'
            AND sd.parentfield='earnings' AND LOWER(sd.salary_component) LIKE %(variable_like)s
        {catj} WHERE {cond}{divc}
          AND EXISTS (SELECT 1 FROM `tabSalary Structure Assignment` ssa
              INNER JOIN `tabSalary Details` ssa_sd ON ssa_sd.parent=ssa.name AND ssa_sd.parenttype='Salary Structure Assignment'
                  AND ssa_sd.parentfield='earnings' AND LOWER(ssa_sd.salary_component) LIKE %(variable_like)s AND ssa_sd.amount>0
              WHERE ssa.employee=ss.employee AND ssa.from_date<=%(start_date)s AND (ssa.to_date IS NULL OR ssa.to_date>=%(start_date)s))
        ORDER BY ss.employee_name
    """, params, as_dict=1)
    if not rows: return cols, []
    month,year=filters.get("month",""),filters.get("year","")
    vpa_name=f"{year} - {month}"; vpa_map={}
    if frappe.db.exists("Variable Pay Assignment",vpa_name):
        vpa_map={r.division:flt(r.percentage) for r in frappe.db.sql("SELECT division,percentage FROM `tabVariable Pay Detail Table` WHERE parent=%(v)s AND parenttype='Variable Pay Assignment'",{"v":vpa_name},as_dict=1)}
    emp_ids=list({r.employee_id for r in rows}); mv_map={}
    if emp_ids:
        for r in frappe.db.sql("SELECT ssa.employee,ssa_sd.amount AS monthly_variable_pay FROM `tabSalary Structure Assignment` ssa INNER JOIN `tabSalary Details` ssa_sd ON ssa_sd.parent=ssa.name AND ssa_sd.parenttype='Salary Structure Assignment' AND ssa_sd.parentfield='earnings' AND LOWER(ssa_sd.salary_component) LIKE %(vl)s AND ssa_sd.amount>0 WHERE ssa.employee IN %(ids)s AND ssa.from_date<=%(sd)s AND (ssa.to_date IS NULL OR ssa.to_date>=%(sd)s) ORDER BY ssa.from_date DESC",{"ids":tuple(emp_ids),"sd":params.get("start_date",""),"vl":"%variable%"},as_dict=1):
            if r.employee not in mv_map: mv_map[r.employee]=flt(r.monthly_variable_pay)
    data=[]; tmv=tva=0.0
    for row in rows:
        div=row.division or ""; pct=vpa_map.get(div,0.0); mv=mv_map.get(row.employee_id,0.0); vpa=flt(row.variable_pay_amount,2)
        tmv+=mv; tva+=vpa
        data.append({"employee_id":row.employee_id,"employee_name":row.employee_name,"division":div,"monthly_variable_pay":flt(mv,2),"variable_pay_percentage":flt(pct,2),"variable_pay_amount":vpa})
    if data: data.append({"employee_id":"","employee_name":"Total","division":"","monthly_variable_pay":flt(tmv,2),"variable_pay_percentage":None,"variable_pay_amount":flt(tva,2),"bold":1})
    return cols, data


def _monthly_attendance(filters):
    month_str,year_str=filters.get("month",""),filters.get("year","")
    month_num=MONTH_MAP.get(month_str)
    cols=[_col("Employee ID","employee",width=130),_col("Employee Name","employee_name",width=180)]
    if not month_num or not year_str: return cols, []
    year_int=int(year_str); last=calendar.monthrange(year_int,month_num)[1]
    from_date=f"{year_int}-{month_num:02d}-01"; to_date=f"{year_int}-{month_num:02d}-{last:02d}"
    for d in range(1,last+1): cols.append({"label":str(d),"fieldname":f"day_{d}","fieldtype":"Data","width":28})
    cols+=[_col("WD","working_days","Int",40),_col("P","present_days","Float",45,precision=2),
           _col("HD","half_days","Float",40,precision=2),_col("A","absent_days","Float",40,precision=2),
           _col("WO","weekly_off_days","Int",40),_col("H","holiday_days","Int",35),
           _col("LWP","lwp_days","Int",40),_col("A+LWP","absent_lwp","Float",50,precision=2)]
    companies=_parse_list(filters.get("company"))
    if not companies: return cols, []
    co=tuple(companies) if len(companies)>1 else (companies[0],companies[0])
    params={"from_date":from_date,"to_date":to_date,"companies":co}
    cat=filters.get("category"); cat_join=""
    if cat: params["category"]=cat; cat_join="INNER JOIN `tabCompany Link` cl ON cl.name=a.employee AND cl.category=%(category)s"
    emp_cond=""
    se=_parse_list(filters.get("employee"))
    if se: params["employees"]=tuple(se) if len(se)>1 else (se[0],se[0]); emp_cond="AND a.employee IN %(employees)s"
    div_cond=""
    divs=_parse_list(filters.get("division"))
    if divs: params["divisions"]=tuple(divs) if len(divs)>1 else (divs[0],divs[0]); div_cond="AND a.employee IN (SELECT name FROM `tabCompany Link` WHERE division IN %(divisions)s OR department IN %(divisions)s)"
    records=frappe.db.sql(f"""
        SELECT a.employee,a.employee_name,a.attendance_date,a.status FROM `tabAttendance` a {cat_join}
        WHERE a.company IN %(companies)s AND a.attendance_date BETWEEN %(from_date)s AND %(to_date)s {emp_cond} {div_cond}
        ORDER BY a.employee_name,a.attendance_date
    """, params, as_dict=1)
    if not records: return cols, []
    emp_dict={}; emp_order=[]
    STATUS_MAP={"Present":("present_days",1,"P"),"Absent":("absent_days",1,"A"),"Weekly Off":("weekly_off_days",1,"WO"),
                "Holiday":("holiday_days",1,"H"),"LWP":("lwp_days",1,"LWP")}
    for row in records:
        emp=row.employee; day=row.attendance_date.day if hasattr(row.attendance_date,"day") else int(str(row.attendance_date)[8:10])
        if emp not in emp_dict:
            emp_order.append(emp)
            emp_dict[emp]={"employee":emp,"employee_name":row.employee_name or "","working_days":last,
                           "present_days":0.0,"half_days":0.0,"absent_days":0.0,"weekly_off_days":0,"holiday_days":0,"lwp_days":0,"absent_lwp":0.0}
        st=row.status
        if st=="Half Day":
            emp_dict[emp]["half_days"]+=1; emp_dict[emp]["present_days"]+=0.5
            emp_dict[emp]["absent_days"]+=0.5; emp_dict[emp][f"day_{day}"]="HD"
        elif st in STATUS_MAP:
            k,v,code=STATUS_MAP[st]; emp_dict[emp][k]+=v; emp_dict[emp][f"day_{day}"]=code
            if st in ("Absent","LWP"): emp_dict[emp]["absent_lwp"]+=1
        else: emp_dict[emp][f"day_{day}"]="-"
    for emp in emp_dict:
        for d in range(1,last+1): emp_dict[emp].setdefault(f"day_{d}","-")
    data=[emp_dict[e] for e in emp_order]
    if data:
        totals={"employee":"","employee_name":"Total","_is_total":True,"working_days":0,"present_days":0.0,
                "half_days":0.0,"absent_days":0.0,"weekly_off_days":0,"holiday_days":0,"lwp_days":0,"absent_lwp":0.0}
        for d in range(1,last+1): totals[f"day_{d}"]=""
        for r in data:
            for k in ["working_days","present_days","half_days","absent_days","weekly_off_days","holiday_days","lwp_days","absent_lwp"]:
                totals[k]=round(flt(totals[k])+flt(r.get(k,0)),2)
        data.append(totals)
    return cols, data


ROUTER = {
    "bank_advice":               _bank_advice,
    "educational_allowance":     _educational_allowance,
    "esi_register":              _esi_register,
    "labour_welfare_fund":       _labour_welfare_fund,
    "professional_tax":          _professional_tax,
    "provident_fund":            _provident_fund,
    "retention_deposit":         _retention_deposit,
    "salary_summary":            _salary_summary,
    "salary_summary_individual": _salary_summary_individual,
    "transaction_checklist":     _transaction_checklist,
    "variable_pay":              _variable_pay,
    "monthly_attendance":        _monthly_attendance,
}


@frappe.whitelist()
def get_employees_for_filter(companies=None, category=None, txt=""):
    companies=_parse_list(companies); params={"txt":f"%{txt}%"}
    conds=["ss.docstatus=1","(ss.employee LIKE %(txt)s OR ss.employee_name LIKE %(txt)s)"]; catj=""
    if companies: params["companies"]=tuple(companies); conds.append("ss.company IN %(companies)s")
    if category: params["category"]=category; catj="INNER JOIN `tabCompany Link` cl_cat ON cl_cat.name=ss.employee AND cl_cat.category=%(category)s"
    return frappe.db.sql(f"SELECT DISTINCT ss.employee,ss.employee_name FROM `tabSalary Slip` ss {catj} WHERE {' AND '.join(conds)} ORDER BY ss.employee_name LIMIT 50", params, as_dict=1)