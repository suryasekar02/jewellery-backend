//const API_URL = 'http://51.20.73.184:3000';
const API_URL = 'https://jewellery-backend-3-pinu.onrender.com';
let lastData = {}; // Store last fetched data for export

function exportToExcel(type) {
    const rawData = lastData[type];
    if (!rawData || rawData.length === 0) {
        alert('No data available to export.');
        return;
    }

    // Flatten data if it contains subtables (items, saleItems, stockItems, etc.)
    const flattenedData = flattenData(rawData);

    const worksheet = XLSX.utils.json_to_sheet(flattenedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Records");

    const fileName = `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

function flattenData(data) {
    const result = [];
    const itemKeys = ['items', 'saleItems', 'stockItems', 'inventoryItems', 'purchaseItems', 'pureMcItems'];

    data.forEach(row => {
        // Find if this row has any sub-items
        let subItems = null;
        let subKey = null;

        for (const key of itemKeys) {
            if (Array.isArray(row[key])) {
                subItems = row[key];
                subKey = key;
                break;
            }
        }

        if (subItems && subItems.length > 0) {
            subItems.forEach(item => {
                const flatRow = { ...row };
                // Remove the original array to keep Excel clean
                delete flatRow[subKey];

                // Add item details to the flat row
                // Prefix item keys to avoid collision
                Object.keys(item).forEach(k => {
                    flatRow[`ITEM_${k.toUpperCase()}`] = item[k];
                });
                result.push(flatRow);
            });
        } else {
            // No sub-items, just push the row (clean up arrays if any empty ones)
            const cleanRow = { ...row };
            itemKeys.forEach(k => delete cleanRow[k]);
            result.push(cleanRow);
        }
    });

    return result;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('loginForm')) {
        handleLogin();
    } else {
        initDashboard();
    }
});

function handleLogin() {
    const form = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = form.username.value;
        const password = form.password.value;

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginname: username, password: password })
            });

            if (response.ok) {
                const user = await response.json();
                localStorage.setItem('user', JSON.stringify(user));
                window.location.href = 'dashboard.html';
            } else {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'Invalid credentials';
            }
        } catch (err) {
            console.error('Login error:', err);
            errorMsg.style.display = 'block';
            errorMsg.textContent = 'Server error';
        }
    });
}

function initDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('adminName').textContent = user.username || user.loginname;

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    const navLinks = document.querySelectorAll('.sidebar-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('href').substring(1);
            showSection(targetId);
        });
    });

    loadDashboardStats();
    if (typeof initAdvancedSearch === 'function') initAdvancedSearch(); // Initialize Search
}

function showSection(sectionId) {
    document.querySelectorAll('.section-content').forEach(el => el.classList.add('d-none'));
    const target = document.getElementById(sectionId + '-section');
    if (target) {
        target.classList.remove('d-none');
        // Auto-load data if button exists inside
        const btn = target.querySelector('.refresh-btn');
        if (btn) btn.click();
    } else if (sectionId === 'dashboard') {
        document.getElementById('dashboard-section').classList.remove('d-none');
        loadDashboardStats();
    }
}

// Reuseable loader
async function loadGeneric(endpoint, containerId, columns) {
    const container = document.getElementById(containerId);
    container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_URL}/${endpoint}`);
        const data = await res.json();
        lastData[endpoint] = data; // Store for export

        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<p>No records found.</p>';
            return;
        }

        let html = '<table><thead><tr>';
        columns.forEach(col => {
            html += `<th>${col.toUpperCase()}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += '<tr>';
            columns.forEach(col => {
                let val = row[col];
                if (val === undefined || val === null) val = '-';
                // Basic check for objects (like nested items) - though this generic loader implies flat data or specific cols
                if (typeof val === 'object') val = JSON.stringify(val);
                html += `<td>${val}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = 'Error loading data.';
    }
}

async function loadDashboardStats() {
    try {
        const salesRes = await fetch(`${API_URL}/view_sales`);
        const sales = await salesRes.json();

        const usersRes = await fetch(`${API_URL}/view_users`);
        const users = await usersRes.json();

        let totalSales = 0;
        if (Array.isArray(sales)) {
            totalSales = sales.reduce((acc, sale) => {
                let saleTotal = 0;
                if (sale.saleItems) {
                    saleTotal = sale.saleItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                }
                return acc + saleTotal;
            }, 0);
        }

        document.getElementById('stat-total-sales').textContent = '₹' + totalSales.toLocaleString();
        document.getElementById('stat-total-orders').textContent = Array.isArray(sales) ? sales.length : 0;
        document.getElementById('stat-total-users').textContent = Array.isArray(users) ? users.length : 0;

    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Optimized Custom Loaders for complex tables
async function loadSales() {
    const container = document.getElementById('sales-data');
    container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_URL}/view_sales`);
        const data = await res.json();

        if (data.length === 0) {
            container.innerHTML = '<p>No sales records found.</p>';
            return;
        }

        let html = `<table>
            <thead>
                <tr>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>DSE</th>
                    <th>Retailer</th>
                    <th>Total Amount</th>
                    <th>Items</th>
                </tr>
            </thead>
            <tbody>`;

        data.forEach(row => {
            let totalAmt = 0;
            let itemsDesc = '';
            if (row.saleItems) {
                totalAmt = row.saleItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                itemsDesc = row.saleItems.map(i => `${i.product} (${i.weight}g)`).join(', ');
            }

            html += `<tr>
                <td>${row.invno}</td>
                <td>${row.date}</td>
                <td>${row.dse}</td>
                <td>${row.retailer}</td>
                <td>₹${totalAmt.toLocaleString()}</td>
                <td>${itemsDesc}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = 'Error loading sales data.';
    }
}

async function loadStock() {
    const container = document.getElementById('stock-data');
    container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_URL}/view_stock`);
        const data = await res.json();

        if (data.length === 0) {
            container.innerHTML = '<p>No stock records found.</p>';
            return;
        }

        let html = `<table>
            <thead>
                <tr>
                    <th>Stock ID</th>
                    <th>Date</th>
                    <th>DSE</th>
                    <th>Items</th>
                </tr>
            </thead>
            <tbody>`;

        data.forEach(row => {
            let itemsDesc = row.stockItems ? row.stockItems.map(i => `${i.item} (${i.wt}g)`).join(', ') : '';
            html += `<tr>
                <td>${row.stockid}</td>
                <td>${row.date}</td>
                <td>${row.dse}</td>
                <td>${itemsDesc}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = 'Error loading stock data.';
    }
}

// Advanced Search Logic

function initAdvancedSearch() {
    const searchType = document.getElementById('searchType');
    const searchForm = document.getElementById('searchForm');
    const clearBtn = document.getElementById('clearSearchBtn');

    // Load Autocomplete Data
    loadAutocompleteData();

    // Dynamic Filter Visibility
    searchType.addEventListener('change', () => {
        const type = searchType.value;
        const dseGroup = document.getElementById('filter-dse-group');
        const retailerGroup = document.getElementById('filter-retailer-group');
        const partyGroup = document.getElementById('filter-party-group');

        // Reset visibility
        dseGroup.style.display = 'block';
        retailerGroup.style.display = 'block';
        partyGroup.style.display = 'none';

        if (type === 'payment') {
            retailerGroup.style.display = 'none'; // DSE Payments don't have retailer
        } else if (type === 'expenses') {
            dseGroup.style.display = 'none';
            retailerGroup.style.display = 'none';
        } else if (type === 'purchase') {
            dseGroup.style.display = 'none';
            retailerGroup.style.display = 'none';
            partyGroup.style.display = 'block';
        } else if (type === 'stock') {
            retailerGroup.style.display = 'none';
        } else if (type === 'inventory') {
            retailerGroup.style.display = 'none';
        }
    });

    // Handle Search Submit
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch();
    });

    clearBtn.addEventListener('click', () => {
        searchForm.reset();
        document.getElementById('search-results-container').innerHTML = '<p class="text-muted">Select filters and search to see results.</p>';
    });
}

function loadAutocompleteData() {
    fetch(`${API_URL}/get_autocomplete_data`)
        .then(res => res.json())
        .then(data => {
            if (data.dse) populateDatalist('dseList', data.dse);
            if (data.retailer) populateDatalist('retailerList', data.retailer);
            if (data.party) populateDatalist('partyList', data.party);
            if (data.items) populateDatalist('itemList', data.items);
        })
        .catch(err => console.error('Error loading autocomplete data:', err));
}

function populateDatalist(id, items) {
    const datalist = document.getElementById(id);
    if (!datalist) return;
    datalist.innerHTML = items.map(item => `<option value="${item}">`).join('');
}

async function performSearch() {
    const type = document.getElementById('searchType').value;
    const filters = {
        dateFrom: document.getElementById('searchDateFrom').value,
        dateTo: document.getElementById('searchDateTo').value,
        dse: document.getElementById('searchDse').value,
        retailer: document.getElementById('searchRetailer').value,
        party: document.getElementById('searchParty').value,
        amountMin: document.getElementById('searchAmountMin').value,
        amountMax: document.getElementById('searchAmountMax').value,
        itemName: document.getElementById('searchItemName').value,
        userid: localStorage.getItem('userId') // Send UserID if available
    };

    // Clean empty filters
    Object.keys(filters).forEach(key => (filters[key] === '' || filters[key] === null) && delete filters[key]);

    const container = document.getElementById('search-results-container');
    container.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`${API_URL}/search_transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, filters })
        });

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        renderSearchResults(type, data);

        // Show export button for search results
        const exportBtn = document.getElementById('export-search-btn');
        if (exportBtn) {
            exportBtn.classList.remove('d-none');
            exportBtn.onclick = () => exportToExcel(type); // Export current search type
        }

    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
    }
}

function renderSearchResults(type, data, containerId = 'search-results-container') {
    const container = document.getElementById(containerId);
    lastData[type] = data; // Store for export

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-muted">No results found.</p>';
        return;
    }

    let columns = [];
    if (type === 'sales') columns = ['Date', 'Inv No', 'DSE', 'Retailer', 'Final Total'];
    else if (type === 'payment') columns = ['Date', 'Pay ID', 'DSE', 'Amount', 'Mode'];
    else if (type === 'retailer_payment') columns = ['Date', 'Pay ID', 'DSE', 'Retailer', 'Amount', 'Mode'];
    else if (type === 'stock') columns = ['Date', 'Stock ID', 'DSE'];
    else if (type === 'inventory') columns = ['Date', 'Invent ID', 'DSE'];
    else if (type === 'purchase') columns = ['Date', 'Purchase ID', 'Party'];
    else if (type === 'puremc') columns = ['Date', 'Pure ID', 'DSE', 'Retailer'];
    else if (type === 'expenses') columns = ['Date', 'Ex ID', 'Particulars', 'Pay Mode', 'Amount', 'Pure', 'Description'];
    else if (type === 'petrol') columns = ['Date', 'Pet ID', 'DSE', 'Amount', 'Description'];

    let html = '<table class="data-table"><thead><tr>';

    // Check if Type supports Nested Grid
    const hasNested = ['sales', 'stock', 'purchase', 'puremc', 'inventory', 'retailer_payment'].includes(type);
    if (hasNested) html += '<th>Details</th>';

    columns.forEach(col => html += `<th>${col}</th>`);
    html += '</tr></thead><tbody>';

    data.forEach((row, index) => {
        const rowId = `${type}-row-${index}`; // Unique ID based on type
        html += `<tr class="main-row">`;

        if (hasNested) {
            html += `<td><button class="btn-toggle" onclick="toggleDetail('${rowId}')"><i class="fas fa-plus-circle"></i></button></td>`;
        }

        if (type === 'sales') {
            html += `<td>${row.date}</td><td>${row.invno}</td><td>${row.dse}</td><td>${row.retailer}</td><td>₹${row.finaltotal}</td>`;
        } else if (type === 'payment') {
            html += `<td>${row.date}</td><td>${row.payid}</td><td>${row.dsename}</td><td>₹${row.amount}</td><td>${row.mode}</td>`;
        } else if (type === 'retailer_payment') {
            html += `<td>${row.date}</td><td>${row.payid}</td><td>${row.dsename}</td><td>${row.retailername}</td><td>₹${row.amount}</td><td>${row.mode}</td>`;
        } else if (type === 'stock') {
            html += `<td>${row.date}</td><td>${row.stockid}</td><td>${row.dse}</td>`;
        } else if (type === 'inventory') {
            html += `<td>${row.date}</td><td>${row.inventid}</td><td>${row.dse}</td>`;
        } else if (type === 'purchase') {
            html += `<td>${row.date}</td><td>${row.purchaseid}</td><td>${row.party}</td>`;
        } else if (type === 'puremc') {
            html += `<td>${row.date}</td><td>${row.pureid}</td><td>${row.dsename}</td><td>${row.retailername}</td>`;
        } else if (type === 'expenses') {
            html += `<td>${row.date}</td><td>${row.exid}</td><td>${row.particulars}</td><td>${row.paymode || '-'}</td><td>₹${row.amount}</td><td>${row.pure || '0'}</td><td>${row.description || '-'}</td>`;
        } else if (type === 'petrol') {
            html += `<td>${row.date}</td><td>${row.petid}</td><td>${row.dsename}</td><td>₹${row.amount}</td><td>${row.description || '-'}</td>`;
        }
        html += '</tr>';

        // Nested Row
        if (hasNested) {
            let nestedHtml = '';

            // Handle Item Lists (Sales, Stock, Purchase, PureMC, Inventory)
            if (['sales', 'stock', 'purchase', 'puremc', 'inventory'].includes(type)) {
                if (row.items && row.items.length > 0) {
                    nestedHtml = `<table class="nested-table">
                        <thead>
                            <tr>
                                <th>Item</th><th>Weight</th><th>Count</th>
                                ${type === 'sales' ? '<th>Rate</th><th>Total</th>' : ''}
                                ${['stock', 'inventory'].includes(type) ? '<th>Cover</th>' : ''}
                                ${type === 'purchase' ? '<th>MC</th><th>%</th><th>Pure</th><th>Total</th>' : ''}
                                ${type === 'puremc' ? '<th>MC</th><th>Total</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>`;

                    row.items.forEach(item => {
                        nestedHtml += `<tr>
                            <td>${item.item || item.product || '-'}</td>
                            <td>${item.weight || item.wt || 0}</td>
                            <td>${item.count || 0}</td>
                            ${type === 'sales' ? `<td>${item.rate}</td><td>₹${item.total}</td>` : ''}
                            ${['stock', 'inventory'].includes(type) ? `<td>${item.cover || item.coverwt || 0}</td>` : ''}
                            ${type === 'purchase' ? `<td>${item.mc || 0}</td><td>${item.percent || 0}%</td><td>${item.pure || 0}</td><td>₹${item.totalamount || 0}</td>` : ''}
                            ${type === 'puremc' ? `<td>${item.mc}</td><td>₹${item.total}</td>` : ''}
                        </tr>`;
                    });
                    nestedHtml += `</tbody></table>`;
                } else {
                    nestedHtml = '<p class="text-muted p-2">No items found.</p>';
                }
            }
            // Handle Detail View (Retailer Payment)
            else if (type === 'retailer_payment') {
                nestedHtml = `<div class="detail-view">
                    <p><strong>Silver Weight:</strong> ${row.silverweight || '0'} g</p>
                    <p><strong>Description:</strong> ${row.description || '-'}</p>
                </div>`;
            }

            html += `<tr id="${rowId}" class="detail-row d-none">
                <td colspan="${columns.length + 1}">
                    <div class="nested-container">
                        ${nestedHtml}
                    </div>
                </td>
            </tr>`;
        }
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function toggleDetail(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        if (row.classList.contains('d-none')) {
            row.classList.remove('d-none');
        } else {
            row.classList.add('d-none');
        }
    }
}

// Global Loader for Transaction Tabs
async function loadTransactions(type) {
    const config = {
        'sales': { endpoint: 'view_sales', container: 'sales-data', itemsKey: 'saleItems' },
        'stock': { endpoint: 'view_stock', container: 'stock-data', itemsKey: 'stockItems' },
        'inventory': { endpoint: 'view_inventory', container: 'inventory-data', itemsKey: 'inventoryItems' },
        'purchase': { endpoint: 'view_purchase', container: 'purchases-data', itemsKey: 'purchaseItems' },
        'puremc': { endpoint: 'view_puremc', container: 'puremc-data', itemsKey: 'pureMcItems' }
    }[type];

    if (!config) {
        console.error('Invalid transaction type for loader:', type);
        return;
    }

    const container = document.getElementById(config.container);
    container.innerHTML = 'Loading...';

    try {
        const res = await fetch(`${API_URL}/${config.endpoint}`);
        const data = await res.json();

        if (!Array.isArray(data)) {
            container.innerHTML = '<p class="text-danger">Error loading data.</p>';
            return;
        }

        // Normalize Data: Map specific item keys to 'items'
        data.forEach(row => {
            if (row[config.itemsKey]) {
                row.items = row[config.itemsKey];
            }
        });

        renderSearchResults(type, data, config.container);

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="text-danger">Error loading data.</p>';
    }
}
