frappe.ready(function () {
    const searchInput = document.getElementById('employee-search-input');
    const clearBtn = document.getElementById('clear-search');
    const searchResults = document.getElementById('search-results');
    const employeeSelect = document.getElementById('employee-select');
    const timelineSection = document.getElementById('timeline-container');
    const timelineContent = document.getElementById('timeline-content');
    const noData = document.getElementById('no-data');

    const gotoHomeBtn = document.getElementById("goto_home");
    gotoHomeBtn.addEventListener("click", () => {
        window.location.href = '/app/saral-hr';
    });

    // Load all employees from hidden select (for instant local search)
    const allEmployees = Array.from(employeeSelect.options)
        .filter(option => option.value)
        .map(option => ({
            name: option.value,           // HR-EMP-00001
            employee: option.textContent.trim(), // Piyush Prakash Ladole (aadhar)
            emp_id: option.value          // HR-EMP-00001
        }));

    let selectedIndex = -1;
    let filteredEmployees = [];
    let currentSelectedEmployee = null;
    let searchDebounceTimer = null;

    // ─── Search Logic ─────────────────────────────────────────────

    /**
     * Local search — searches name, display text, and emp ID
     * Used for instant results before API kicks in
     */
    function localSearch(searchTerm) {
        if (!searchTerm) return allEmployees;
        const lower = searchTerm.toLowerCase();
        return allEmployees.filter(emp =>
            emp.employee.toLowerCase().includes(lower) ||
            emp.emp_id.toLowerCase().includes(lower)
        );
    }

    /**
     * API search — hits the server for full-text search
     * Searches: first_name, last_name, full name, emp ID, aadhar
     */
    function apiSearch(searchTerm, callback) {
        frappe.call({
            method: 'saral_hr.www.employee_timeline.index.search_employees',
            args: { query: searchTerm },
            freeze: false,
            callback: (r) => {
                callback(r.message || []);
            },
            error: () => {
                callback([]);
            }
        });
    }

    /**
     * Main search handler — shows local results instantly,
     * then updates with API results after debounce
     */
    function handleSearch(searchTerm) {
        // Show local results immediately
        const localResults = localSearch(searchTerm);
        filteredEmployees = localResults;
        showResults(localResults, searchTerm);

        // Debounce API call for richer server-side search
        clearTimeout(searchDebounceTimer);
        if (searchTerm.length >= 2) {
            searchDebounceTimer = setTimeout(() => {
                apiSearch(searchTerm, (apiResults) => {
                    // Merge: API results take priority, deduplicate by name
                    const merged = mergeResults(localResults, apiResults);
                    filteredEmployees = merged;
                    showResults(merged, searchTerm);
                });
            }, 300);
        }
    }

    /**
     * Merge local and API results, deduplicating by employee name
     * API results take priority (richer data)
     */
    function mergeResults(local, api) {
        const seen = new Set();
        const merged = [];

        // API results first (priority)
        for (const emp of api) {
            if (!seen.has(emp.name)) {
                seen.add(emp.name);
                merged.push(emp);
            }
        }

        // Fill in from local if not already present
        for (const emp of local) {
            if (!seen.has(emp.name)) {
                seen.add(emp.name);
                merged.push(emp);
            }
        }

        return merged;
    }

    // ─── UI Rendering ─────────────────────────────────────────────

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
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">No employee found</div>';
            searchResults.classList.add('show');
            selectedIndex = -1;
            return;
        }

        searchResults.innerHTML = results.map((emp, index) =>
            `<div class="search-result-item" data-index="${index}" data-name="${emp.name}">
                <div class="result-name">${highlightText(emp.employee, searchTerm)}</div>
                <div class="result-id">${highlightText(emp.emp_id || emp.name, searchTerm)}</div>
            </div>`
        ).join('');
        searchResults.classList.add('show');

        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            item.addEventListener('click', () => {
                const empName = item.getAttribute('data-name');
                const emp = filteredEmployees.find(e => e.name === empName)
                         || allEmployees.find(e => e.name === empName);
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
        clearTimeout(searchDebounceTimer);
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
        clearTimeout(searchDebounceTimer);
    }

    // ─── Event Listeners ──────────────────────────────────────────

    searchInput.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            clearBtn.style.display = 'flex';
            handleSearch(searchTerm.toLowerCase());
        } else {
            filteredEmployees = allEmployees;
            showResults(allEmployees, '');
        }
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            clearBtn.style.display = 'flex';
        }
        const searchTerm = searchInput.value.trim().toLowerCase();
        filteredEmployees = searchTerm ? localSearch(searchTerm) : allEmployees;
        showResults(filteredEmployees, searchTerm);
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim();
        clearBtn.style.display = searchTerm ? 'flex' : 'none';

        if (!searchTerm) {
            timelineSection.style.display = 'none';
            noData.style.display = 'none';
            timelineContent.innerHTML = '';
            currentSelectedEmployee = null;
            filteredEmployees = allEmployees;
            showResults(allEmployees, '');
            selectedIndex = -1;
            clearTimeout(searchDebounceTimer);
            return;
        }

        handleSearch(searchTerm.toLowerCase());
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

    // ─── Timeline ─────────────────────────────────────────────────

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
            const isActive = record.is_active == 1;
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