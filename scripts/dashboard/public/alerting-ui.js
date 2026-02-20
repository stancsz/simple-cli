async function fetchAlerts() {
  try {
    const response = await fetch('/api/alerts');
    const data = await response.json();
    renderAlerts(data.alerts);
    renderRules(data.rules);
  } catch (e) {
    console.error("Failed to fetch alerts", e);
  }
}

function renderAlerts(alerts) {
  const container = document.getElementById('active-alerts-container');
  if (!container) return;

  if (alerts.length === 0) {
    container.innerHTML = '<p style="color: green;">No active alerts.</p>';
    return;
  }

  const html = alerts.map(a => `
    <div class="alert-item" style="background: #ffebee; border: 1px solid #ef5350; padding: 10px; margin-bottom: 5px; border-radius: 4px;">
      <strong>${a.metric}</strong>: ${a.value.toFixed(2)} (Threshold: ${a.threshold})
      <br><small>${new Date(a.timestamp).toLocaleString()}</small>
    </div>
  `).join('');

  container.innerHTML = html;
}

function renderRules(rules) {
  const container = document.getElementById('alert-rules-container');
  if (!container) return;

  if (rules.length === 0) {
    container.innerHTML = '<p>No alert rules configured.</p>';
    return;
  }

  const html = rules.map(r => `
    <div class="rule-item" style="border-bottom: 1px solid #eee; padding: 5px 0;">
      <strong>${r.metric}</strong> ${r.operator} ${r.threshold}
      <span style="color: #666; font-size: 0.9em;">(${r.channel.type})</span>
    </div>
  `).join('');

  container.innerHTML = html;
}

// Poll every 10 seconds
setInterval(fetchAlerts, 10000);
fetchAlerts();
