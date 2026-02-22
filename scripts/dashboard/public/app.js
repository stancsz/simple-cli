async function fetchMetrics() {
    try {
        const response = await fetch('/api/company_metrics');
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').innerText = 'Error: ' + error.message;
        document.getElementById('status').className = 'stat error';
    }
}

function updateDashboard(data) {
    const companies = Object.keys(data);
    let totalCost = 0;
    let totalTasks = 0;

    const tableBody = document.querySelector('#metrics-table tbody');
    tableBody.innerHTML = '';

    const tokenData = [];
    const successData = [];
    const companyLabels = [];

    companies.forEach(company => {
        const metrics = data[company];
        if (metrics.error) return;

        totalCost += metrics.estimated_cost_usd || 0;
        totalTasks += metrics.task_count || 0;

        companyLabels.push(company);
        tokenData.push(metrics.total_tokens || 0);
        successData.push(metrics.success_rate || 0);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${company}</td>
            <td>${metrics.task_count}</td>
            <td>${(metrics.total_tokens || 0).toLocaleString()}</td>
            <td>${(metrics.avg_duration_ms || 0).toLocaleString()}</td>
            <td>${metrics.success_rate}%</td>
            <td>$${(metrics.estimated_cost_usd || 0).toFixed(4)}</td>
        `;
        tableBody.appendChild(row);
    });

    document.getElementById('total-cost').innerText = `$${totalCost.toFixed(2)}`;
    document.getElementById('total-tasks').innerText = totalTasks.toLocaleString();
    document.getElementById('active-companies').innerText = companies.length;
    document.getElementById('status').innerText = 'Operational';
    document.getElementById('status').className = 'stat';
    document.getElementById('last-updated').innerText = 'Last updated: ' + new Date().toLocaleTimeString();

    renderCharts(companyLabels, tokenData, successData);
}

let tokensChartInstance = null;
let successChartInstance = null;

function renderCharts(labels, tokenData, successData) {
    const ctxTokens = document.getElementById('tokensChart').getContext('2d');
    const ctxSuccess = document.getElementById('successChart').getContext('2d');

    if (tokensChartInstance) tokensChartInstance.destroy();
    if (successChartInstance) successChartInstance.destroy();

    tokensChartInstance = new Chart(ctxTokens, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Tokens',
                data: tokenData,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    successChartInstance = new Chart(ctxSuccess, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Success Rate (%)',
                data: successData,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

// Initial fetch and poll every 30 seconds
fetchMetrics();
setInterval(fetchMetrics, 30000);
