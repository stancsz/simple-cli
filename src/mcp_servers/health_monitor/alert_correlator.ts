import { randomUUID } from "crypto";

export interface Alert {
    metric: string;
    message: string;
    timestamp: string;
}

export interface Incident {
    id: string;
    timestamp: string;
    alerts: Alert[];
    summary: string;
    severity: "low" | "medium" | "high";
}

export function correlateAlerts(alerts: Alert[]): Incident[] {
    // Sort by time
    const sorted = alerts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const incidents: Incident[] = [];

    if (sorted.length === 0) return [];

    let currentIncident: Incident = {
        id: randomUUID(),
        timestamp: sorted[0].timestamp,
        alerts: [sorted[0]],
        summary: `Incident involving ${sorted[0].metric}`,
        severity: "low"
    };

    // Simple clustering by time window (e.g. 5 minutes)
    const timeWindow = 5 * 60 * 1000;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i-1];
        const curr = sorted[i];

        const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();

        if (timeDiff <= timeWindow) {
            currentIncident.alerts.push(curr);
        } else {
            incidents.push(currentIncident);
            currentIncident = {
                 id: randomUUID(),
                 timestamp: curr.timestamp,
                 alerts: [curr],
                 summary: `Incident involving ${curr.metric}`,
                 severity: "low"
            };
        }
    }
    incidents.push(currentIncident);

    // Refine summary and severity
    for (const inc of incidents) {
        const metrics = new Set(inc.alerts.map(a => a.metric));
        inc.summary = `${inc.alerts.length} alerts correlated across ${Array.from(metrics).join(', ')}`;
        if (inc.alerts.length > 5) inc.severity = "high";
        else if (inc.alerts.length > 2) inc.severity = "medium";
    }

    return incidents;
}
