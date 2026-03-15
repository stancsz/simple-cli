import { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * Interface representing a node in the ecosystem topology.
 */
export interface TopologyNode {
    id: string;
    parent?: string;
    status: 'active' | 'archived' | 'failed' | 'unknown';
    created_at: string;
}

/**
 * Interface representing the ecosystem topology graph.
 */
export interface EcosystemTopology {
    nodes: TopologyNode[];
    edges: { source: string; target: string }[];
}

/**
 * Helper to fetch and build the ecosystem topology from audit logs.
 */
export async function get_ecosystem_topology(auditorClient: Client | null): Promise<EcosystemTopology> {
    if (!auditorClient) {
        throw new Error("Ecosystem Auditor client not connected.");
    }

    try {
        // Fetch logs for the last 30 days focusing on morphology adjustments
        const res: any = await auditorClient.callTool({
            name: "generate_ecosystem_audit_report",
            arguments: { timeframe: "last_30_days", focus_area: "morphology_adjustments" }
        });

        if (!res.content || !res.content[0] || !res.content[0].text) {
            throw new Error("Failed to fetch audit logs for topology.");
        }

        const report = JSON.parse(res.content[0].text);
        const events = report.events || [];

        const nodesMap: Record<string, TopologyNode> = {};
        const edges: { source: string; target: string }[] = [];

        // Always include the root agency
        nodesMap['root'] = {
            id: 'root',
            status: 'active',
            created_at: new Date(0).toISOString()
        };

        // Process events chronologically to build the topology state
        const sortedEvents = events.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        for (const event of sortedEvents) {
            const { source_agency, target_agency, timestamp, description, metadata } = event;
            const desc = description.toLowerCase();

            if (desc.includes('spawn') || desc.includes('created')) {
                const childId = target_agency || (metadata && metadata.child_id);
                if (childId) {
                    nodesMap[childId] = {
                        id: childId,
                        parent: source_agency,
                        status: 'active',
                        created_at: timestamp
                    };
                    edges.push({ source: source_agency, target: childId });
                }
            } else if (desc.includes('retire') || desc.includes('archived')) {
                const childId = target_agency || (metadata && metadata.child_id);
                if (childId && nodesMap[childId]) {
                    nodesMap[childId].status = 'archived';
                }
            } else if (desc.includes('merge')) {
                const sourceId = source_agency;
                const targetId = target_agency || (metadata && metadata.target_id);
                if (sourceId && nodesMap[sourceId]) {
                    nodesMap[sourceId].status = 'archived';
                }
            }
        }

        return {
            nodes: Object.values(nodesMap),
            edges
        };

    } catch (e: any) {
        console.error("Error generating ecosystem topology:", e);
        throw e;
    }
}

/**
 * Helper to fetch ecosystem decision logs from the Ecosystem Auditor.
 */
export async function get_ecosystem_decision_logs(auditorClient: Client | null, timeframe: string = "last_7_days", focus_area: string = "all", agency_id?: string): Promise<any[]> {
    if (!auditorClient) {
        throw new Error("Ecosystem Auditor client not connected.");
    }

    try {
        const res: any = await auditorClient.callTool({
            name: "generate_ecosystem_audit_report",
            arguments: { timeframe, focus_area }
        });

        if (!res.content || !res.content[0] || !res.content[0].text) {
            throw new Error("Failed to fetch decision logs.");
        }

        const report = JSON.parse(res.content[0].text);
        let events = report.events || [];

        if (agency_id) {
            events = events.filter((e: any) => e.source_agency === agency_id || e.target_agency === agency_id);
        }

        // Return chronological sort (newest first for decision logs)
        return events.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    } catch (e: any) {
        console.error("Error fetching ecosystem decision logs:", e);
        throw e;
    }
}
