frappe.ready(function () {
    const searchInput = document.getElementById('employee-search-input');
    const clearBtn = document.getElementById('clear-search');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee-select');
    const timelineSection = document.getElementById('timeline-section');
    const timelineContent = document.getElementById('timeline-content');
    const noData = document.getElementById('no-data');

    // Extract employees from select options, trimming the text to avoid whitespace issues
    const employees = Array.from(employeeSelect.options)
        .filter(option => option.value)
        .map(option => ({
            name: option.value,
            employee: option.textContent.trim()
        }));

    let selectedIndex = -1;
    let filteredEmployees = [];

    function showResults(results) {
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, index) =>
            `<div class="search-result-item" data-index="${index}" data-name="${emp.name}">
                ${escapeHtml(emp.employee)}
            </div>`
        ).join('');
        searchResults.classList.add('show');

        // Attach event listeners for click and hover after rendering
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            item.addEventListener('click', () => {
                const empName = item.getAttribute('data-name');
                const emp = employees.find(e => e.name === empName);
                if (emp) selectEmployee(emp);
            });

            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                highlightResult();
            });
        });
    }

    function highlightResult() {
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function selectEmployee(emp) {
        searchInput.value = emp.employee;
        employeeSelect.value = emp.name;
        searchResults.classList.remove('show');
        loadEmployeeTimeline(emp.name);
        selectedIndex = -1;
    }

    // Show all employees on focus if input empty
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() === '') {
            filteredEmployees = employees;
            showResults(filteredEmployees);
        }
    });

    // Search/filter as user types
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();

        clearBtn.style.display = searchTerm ? 'flex' : 'none';

        if (!searchTerm) {
            filteredEmployees = employees;
            showResults(filteredEmployees);
            selectedIndex = -1;
            return;
        }

        filteredEmployees = employees.filter(emp =>
            emp.employee.toLowerCase().includes(searchTerm)
        );
        showResults(filteredEmployees);
        selectedIndex = -1;
    });

    // Clear search input
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        filteredEmployees = employees;
        showResults(filteredEmployees);
        searchInput.focus();
    });

    // Keyboard navigation within results
    searchInput.addEventListener('keydown', (e) => {
        if (!searchResults.classList.contains('show')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredEmployees.length;
            highlightResult();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredEmployees.length) % filteredEmployees.length;
            highlightResult();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && filteredEmployees[selectedIndex]) {
                selectEmployee(filteredEmployees[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            searchResults.classList.remove('show');
            selectedIndex = -1;
        }
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
            selectedIndex = -1;
        }
    });

    // Load timeline via frappe call
    function loadEmployeeTimeline(employee) {
        if (!employee) {
            timelineSection.style.display = 'none';
            noData.style.display = 'none';
            timelineContent.innerHTML = '';
            return;
        }

        timelineContent.innerHTML = '';
        timelineSection.style.display = 'none';
        noData.style.display = 'none';

        frappe.call({
            method: 'saral_hr.www.employee_timeline.index.get_employee_timeline',
            args: { employee },
            freeze: false,
            callback: (r) => {
                const data = r.message || [];
                if (data.length === 0) {
                    timelineSection.style.display = 'none';
                    noData.style.display = 'block';
                    return;
                }
                renderTimeline(data);
                timelineSection.style.display = 'block';
                noData.style.display = 'none';
            },
            error: (err) => {
                console.error('Timeline error:', err);
                timelineSection.style.display = 'none';
                noData.style.display = 'block';
            }
        });
    }

    // Render timeline entries
    function renderTimeline(data) {
        const html = data.map(record => {
            const isActive = !record.end_date;
            const statusText = isActive ? 'Active' : 'Inactive';
            return `
                <div class="timeline-item ${isActive ? 'active' : ''}">
                    <div class="timeline-card">
                        <div class="company-name">${escapeHtml(record.company)}</div>
                        <div class="date-info"><strong>Start:</strong> ${record.start_date || '-'}</div>
                        ${record.end_date ? `<div class="date-info"><strong>End:</strong> ${record.end_date}</div>` : ''}
                        <div class="status-wrapper">
                            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">${statusText}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        timelineContent.innerHTML = html;
    }

    // Basic HTML escaping to prevent injection
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[m]);
    }
});
