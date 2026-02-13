// ─── Salary Slip Dashboard ─── index.js
let chartInstance = null;

function loadDashboard() {
    const company = document.getElementById('company-select').value;
    const year    = document.getElementById('year-select').value;

    if (!company) {
        frappe.show_alert({ message: 'Please select a Company', indicator: 'orange' }, 3);
        return;
    }

    showLoading();
    resetCards();

    frappe.call({
        method: 'saral_hr.www.Salary_dashboard.index.get_salary_dashboard_data',
        args: { company: company, year: year },
        callback: function(r) {
            if (r.exc || !r.message) {
                showError();
                return;
            }
            renderChart(r.message, company, year);
        }
    });
}

function renderChart(data, company, year) {
    hidePlaceholder();

    document.getElementById('chart-subtitle').textContent =
        company + ' — ' + year + ' (January to December)';

    // Summary cards
    // Cards — API se directly sahi values aati hain
    var ct = document.getElementById("card-total"); if(ct) ct.textContent = data.total_employees;
    var cg = document.getElementById("card-generated"); if(cg) cg.textContent = data.total_generated;
    var cp = document.getElementById("card-pending"); if(cp) cp.textContent = data.total_pending;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const ctx    = document.getElementById('salaryChart').getContext('2d');
    const maxVal = Math.max(data.total_employees, 10);

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [
                'January','February','March','April','May','June',
                'July','August','September','October','November','December'
            ],
            datasets: [
                {
                    // Green bar — Generated (Submitted)
                    label: 'Generated',
                    data: data.generated,
                    backgroundColor: '#16a34a',
                    hoverBackgroundColor: '#15803d',
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 18,
                },
                {
                    // Orange bar — Pending (Draft + Not created)
                    label: 'Pending',
                    data: data.pending,
                    backgroundColor: '#ea580c',
                    hoverBackgroundColor: '#c2410c',
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 18,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // grouped: true ensures side by side bars per month
            plugins: {
                legend: {
                    // Chart.js legend band karo — HTML mein already hai
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rect',
                        boxWidth: 13, boxHeight: 13,
                        font: { size: 12 },
                        color: '#374151',
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(item) {
                            const idx      = item.dataIndex;
                            const gen      = data.generated[idx];
                            const pend     = data.pending[idx];
                            const total    = gen + pend;
                            const val      = item.raw;
                            const pct      = total > 0 ? Math.round((val / total) * 100) : 0;
                            return '  ' + item.dataset.label + ': ' + val + '  (' + pct + '%)';
                        },
                        afterBody: function(items) {
                            const idx  = items[0].dataIndex;
                            const gen  = data.generated[idx];
                            const pend = data.pending[idx];
                            return ['', '  Total Employees: ' + (gen + pend)];
                        }
                    }
                }
            },
            scales: {
                x: {
                    // X-axis: January to December
                    grouped: true,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 10 },
                        maxRotation: 30,
                        minRotation: 0
                    }
                },
                y: {
                    // Y-axis: 0 to total_employees + 2
                    beginAtZero: true,
                    min: 0,
                    max: maxVal + 2,
                    grid: { color: '#f0f2f5' },
                    border: { display: false },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 11 },
                        stepSize: 1,
                        precision: 0
                    }
                }
            }
        }
    });
}

function showLoading() {
    const p = document.getElementById('chart-placeholder');
    p.style.display = 'flex';
    p.innerHTML = '<span class="loading-spinner"></span><span style="margin-left:8px;">Loading...</span>';
}
function showError() {
    const p = document.getElementById('chart-placeholder');
    p.style.display = 'flex';
    p.innerHTML = '<span style="font-size:28px;">⚠️</span><span style="margin-left:8px;">Error. Check console F12.</span>';
}
function hidePlaceholder() {
    document.getElementById('chart-placeholder').style.display = 'none';
}
function resetCards() {
    // Cards remove ho gayi hain HTML se — null check zaroori hai
    ['card-total','card-generated','card-pending'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.textContent = '—';
    });
}