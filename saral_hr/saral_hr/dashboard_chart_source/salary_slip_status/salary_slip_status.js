frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["Salary Slip Status"] = {
	method: "saral_hr.dashboard_chart_source.salary_slip_status.salary_slip_status.get_data",

	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
		},
		{
			fieldname: "month",
			label: __("Month"),
			fieldtype: "Select",
			options: [
				"",
				"January", "February", "March", "April",
				"May", "June", "July", "August",
				"September", "October", "November", "December",
			].join("\n"),
			default: frappe.datetime.now_date().split("-")[1]
				? new Date().toLocaleString("default", { month: "long" })
				: "January",
		},
		{
			fieldname: "year",
			label: __("Year"),
			fieldtype: "Select",
			options: (function () {
				const yr = new Date().getFullYear();
				const opts = [""];
				for (let y = yr + 1; y >= yr - 4; y--) opts.push(String(y));
				return opts.join("\n");
			})(),
			default: String(new Date().getFullYear()),
		},
	],
};