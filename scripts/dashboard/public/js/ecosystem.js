document.addEventListener('DOMContentLoaded', () => {
    fetchTopology();
    fetchDecisionLogs();

    document.getElementById('timeframe-select').addEventListener('change', fetchDecisionLogs);
    document.getElementById('focus-area-select').addEventListener('change', fetchDecisionLogs);
    document.getElementById('agency-id-input').addEventListener('input', debounce(fetchDecisionLogs, 500));
});

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function fetchTopology() {
    try {
        const response = await fetch('/api/dashboard/ecosystem-topology');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        renderTopology(data);
    } catch (error) {
        console.error('Error fetching topology:', error);
        document.getElementById('topology-container').innerHTML = '<p style="color: red;">Failed to load topology.</p>';
    }
}

async function fetchDecisionLogs() {
    const timeframe = document.getElementById('timeframe-select').value;
    const focusArea = document.getElementById('focus-area-select').value;
    const agencyId = document.getElementById('agency-id-input').value;

    const query = new URLSearchParams({
        timeframe: timeframe,
        focus_area: focusArea
    });
    if (agencyId) {
        query.append('agency_id', agencyId);
    }

    try {
        const response = await fetch(`/api/dashboard/ecosystem-decision-logs?${query.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const logs = await response.json();
        renderDecisionLogs(logs);
    } catch (error) {
        console.error('Error fetching decision logs:', error);
        document.getElementById('decision-logs-body').innerHTML = '<tr><td colspan="5">Failed to load logs.</td></tr>';
    }
}

async function renderTopology(data) {
    const container = document.getElementById('topology-container');
    container.innerHTML = ''; // clear old

    const nodes = data.nodes || [];
    const edges = data.edges || [];

    if (nodes.length === 0) {
        container.innerHTML = '<p>No topology data available.</p>';
        return;
    }

    let mermaidGraph = 'graph TD\n';

    // Add nodes
    nodes.forEach(node => {
        // Sanitize IDs for mermaid (remove hyphens, spaces)
        const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = node.id.length > 15 ? node.id.substring(0, 15) + '...' : node.id;

        let styleClass = 'default';
        if (node.id === 'root') styleClass = 'root';
        else if (node.status === 'active') styleClass = 'active';
        else if (node.status === 'archived') styleClass = 'archived';
        else styleClass = 'failed';

        mermaidGraph += `    ${safeId}["${displayName}"]:::${styleClass}\n`;
    });

    // Add edges
    edges.forEach(edge => {
        const sourceId = edge.source.replace(/[^a-zA-Z0-9]/g, '_');
        const targetId = edge.target.replace(/[^a-zA-Z0-9]/g, '_');
        mermaidGraph += `    ${sourceId} --> ${targetId}\n`;
    });

    // Add class definitions
    mermaidGraph += '\n';
    mermaidGraph += '    classDef root fill:#007bff,stroke:#0056b3,stroke-width:2px,color:#fff;\n';
    mermaidGraph += '    classDef active fill:#28a745,stroke:#1e7e34,stroke-width:2px,color:#fff;\n';
    mermaidGraph += '    classDef archived fill:#6c757d,stroke:#545b62,stroke-width:2px,color:#fff;\n';
    mermaidGraph += '    classDef failed fill:#dc3545,stroke:#bd2130,stroke-width:2px,color:#fff;\n';
    mermaidGraph += '    classDef default fill:#444,stroke:#333,stroke-width:1px,color:#fff;\n';

    const renderDiv = document.createElement('div');
    renderDiv.className = 'mermaid';
    renderDiv.textContent = mermaidGraph;
    container.appendChild(renderDiv);

    try {
        await mermaid.run({ nodes: [renderDiv] });
    } catch (e) {
        console.error('Mermaid rendering failed:', e);
        container.innerHTML = '<p style="color: red;">Failed to render topology graph.</p>';
    }
}

function renderDecisionLogs(logs) {
    const tbody = document.getElementById('decision-logs-body');
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.textAlign = 'center';
        td.textContent = 'No logs found for the selected criteria.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');

        const tdTime = document.createElement('td');
        tdTime.textContent = new Date(log.timestamp).toLocaleString();

        const tdType = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `type-badge type-${log.event_type.replace('_', '-')}`;
        badge.textContent = log.event_type;
        tdType.appendChild(badge);

        const tdSource = document.createElement('td');
        tdSource.textContent = log.source_agency || '-';

        const tdTarget = document.createElement('td');
        tdTarget.textContent = log.target_agency || '-';

        const tdDesc = document.createElement('td');
        tdDesc.textContent = log.description;

        tr.appendChild(tdTime);
        tr.appendChild(tdType);
        tr.appendChild(tdSource);
        tr.appendChild(tdTarget);
        tr.appendChild(tdDesc);

        tbody.appendChild(tr);
    });
}
