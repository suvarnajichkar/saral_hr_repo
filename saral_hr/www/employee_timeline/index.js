frappe.ready(function () {
    const searchInput = document.getElementById('employee-search-input');
    const clearBtn = document.getElementById('clear-search');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee-select');
    const timelineSection = document.getElementById('timeline-container');
    const timelineContent = document.getElementById('timeline-content');
    const noData = document.getElementById('no-data');

    // Home button
    const gotoHomeBtn = document.getElementById("goto_home");
    gotoHomeBtn.addEventListener("click", () => {
        window.location.href = '/app/saral-hr';
    });

    // Extract employees from select options
    const employees = Array.from(employeeSelect.options)
        .filter(option => option.value)
        .map(option => ({
            name: option.value,
            employee: option.textContent.trim()
        }));

    console.log('Total employees loaded:', employees.length);

    let selectedIndex = -1;
    let filteredEmployees = [];
    let currentSelectedEmployee = null;

    function highlightText(text, searchTerm) {
        if (!searchTerm) return escapeHtml(text);
        
        const escapedText = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
        return escapedText.replace(regex, '<mark>$1</mark>');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function showResults(results, searchTerm = '') {
        console.log('showResults called with', results.length, 'results');
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, index) =>
            `<div class="search-result-item" data-index="${index}" data-name="${emp.name}">
                ${highlightText(emp.employee, searchTerm)}
            </div>`
        ).join('');
        searchResults.classList.add('show');

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
        currentSelectedEmployee = emp;
        searchResults.classList.remove('show');
        clearBtn.style.display = 'flex';
        loadEmployeeTimeline(emp.name);
        selectedIndex = -1;
    }

    function clearSearch() {
        searchInput.value = '';
        currentSelectedEmployee = null;
        clearBtn.style.display = 'none';
        timelineSection.style.display = 'none';
        noData.style.display = 'none';
        timelineContent.innerHTML = '';
        searchResults.classList.remove('show');
        searchInput.focus();
    }

    searchInput.addEventListener('click', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        if (searchInput.value.trim() !== '') {
            clearBtn.style.display = 'flex';
        }
        
        if (searchTerm) {
            filteredEmployees = employees.filter(emp =>
                emp.employee.toLowerCase().includes(searchTerm)
            );
        } else {
            filteredEmployees = employees;
        }
        showResults(filteredEmployees, searchTerm);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() !== '') {
            clearBtn.style.display = 'flex';
        }

        const searchTerm = searchInput.value.toLowerCase().trim();
        if (searchTerm) {
            filteredEmployees = employees.filter(emp =>
                emp.employee.toLowerCase().includes(searchTerm)
            );
        } else {
            filteredEmployees = employees;
        }
        showResults(filteredEmployees, searchTerm);
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        clearBtn.style.display = searchTerm ? 'flex' : 'none';

        if (!searchTerm) {
            timelineSection.style.display = 'none';
            noData.style.display = 'none';
            timelineContent.innerHTML = '';
            currentSelectedEmployee = null;
            filteredEmployees = employees;
            showResults(filteredEmployees, '');
            selectedIndex = -1;
            return;
        }

        filteredEmployees = employees.filter(emp =>
            emp.employee.toLowerCase().includes(searchTerm)
        );
        showResults(filteredEmployees, searchTerm);
        selectedIndex = -1;
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSearch();
    });

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

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && 
            !searchResults.contains(e.target) && 
            !clearBtn.contains(e.target)) {
            searchResults.classList.remove('show');
            selectedIndex = -1;
        }
    });

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