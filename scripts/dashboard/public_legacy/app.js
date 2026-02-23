async function fetchMetrics() {
    try {
        const response = await fetch('/api/dashboard/metrics');
        return await response.json();
    } catch (e) {
        console.error("Failed to fetch metrics", e);
        return null;
    }
}

async function fetchSummary() {
    try {
        const response = await fetch('/api/dashboard/summary');
        const data = await response.json();
        return data.summary;
    } catch (e) {
        console.error("Failed to fetch summary", e);
        return "Failed to load summary.";
    }
}

async function fetchAlerts() {
    try {
        const response = await fetch('/api/dashboard/alerts');
        const data = await response.json();
        return data.alerts || [];
    } catch (e) {
        return [];
    }
}

function renderTable(metrics) {
    const tbody = document.querySelector('#metrics-table tbody');
    tbody.innerHTML = '';

    for (const [company, data] of Object.entries(metrics)) {
        if (data.error) continue;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${company}</td>
            <td>${data.task_count}</td>
            <td>${data.success_rate}%</td>
            <td>${data.avg_duration_ms}</td>
            <td>$${data.estimated_cost_usd}</td>
        `;
        tbody.appendChild(tr);
    }
}

function renderCharts(metrics) {
    const companies = Object.keys(metrics).filter(c => !metrics[c].error);

    // Tasks Chart
    new Chart(document.getElementById('tasksChart'), {
        type: 'bar',
        data: {
            labels: companies,
            datasets: [{
                label: 'Tasks Completed',
                data: companies.map(c => metrics[c].task_count),
                backgroundColor: '#007bff'
            }, {
                label: 'Success Rate (%)',
                data: companies.map(c => metrics[c].success_rate),
                backgroundColor: '#28a745',
                type: 'line'
            }]
        }
    });

    // Costs Chart
    new Chart(document.getElementById('costsChart'), {
        type: 'doughnut',
        data: {
            labels: companies,
            datasets: [{
                data: companies.map(c => metrics[c].estimated_cost_usd),
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF'
                ]
            }]
        }
    });
}

function renderAlerts(alerts) {
    const panel = document.getElementById('alerts-panel');
    const list = document.getElementById('alerts-list');
    list.innerHTML = '';

    if (alerts.length > 0) {
        panel.classList.remove('hidden');
        alerts.forEach(alert => {
            const li = document.createElement('li');
            li.textContent = alert;
            list.appendChild(li);
        });
    } else {
        panel.classList.add('hidden');
    }
}

async function init() {
    const metrics = await fetchMetrics();
    if (metrics) {
        renderTable(metrics);
        renderCharts(metrics);
    }

    // Load alerts
    const alerts = await fetchAlerts();
    renderAlerts(alerts);

    // Load summary last as it takes time
    const summaryText = await fetchSummary();
    const summaryEl = document.getElementById('summary-text');
    summaryEl.textContent = summaryText;
    summaryEl.classList.remove('loading');

    document.getElementById('status-indicator').textContent = "● Connected";
}

init();
