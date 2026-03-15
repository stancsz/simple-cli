import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { get_ecosystem_topology, get_ecosystem_decision_logs } from '../../src/mcp_servers/health_monitor/tools/ecosystem_observability.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Phase 37 Ecosystem Observability Tools', () => {

    const mockEvents = [
        {
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            event_type: 'morphology_adjustment',
            source_agency: 'root',
            target_agency: 'agency-alpha',
            description: 'Spawned agency-alpha',
            metadata: { child_id: 'agency-alpha' }
        },
        {
            timestamp: new Date(Date.now() - 43200000).toISOString(),
            event_type: 'morphology_adjustment',
            source_agency: 'root',
            target_agency: 'agency-beta',
            description: 'Spawned agency-beta',
            metadata: { child_id: 'agency-beta' }
        },
        {
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            event_type: 'communication',
            source_agency: 'agency-alpha',
            target_agency: 'agency-beta',
            description: 'Task delegated to agency-beta',
            metadata: { task_id: 'task-123' }
        },
        {
            timestamp: new Date(Date.now() - 1000).toISOString(),
            event_type: 'policy_change',
            source_agency: 'brain',
            description: 'Updated rate limits',
            metadata: {}
        }
    ];

    const mockAuditorClient = {
        callTool: vi.fn().mockImplementation(async ({ name, arguments: args }) => {
            if (name === 'generate_ecosystem_audit_report') {
                let filtered = [...mockEvents];

                if (args.focus_area && args.focus_area !== 'all') {
                    if (args.focus_area === 'morphology_adjustments') {
                        filtered = filtered.filter(e => e.event_type === 'morphology_adjustment');
                    } else if (args.focus_area === 'communications') {
                        filtered = filtered.filter(e => e.event_type === 'communication');
                    } else if (args.focus_area === 'policy_changes') {
                        filtered = filtered.filter(e => e.event_type === 'policy_change');
                    }
                }

                return {
                    content: [{
                        text: JSON.stringify({
                            events: filtered
                        })
                    }]
                };
            }
            throw new Error(`Unknown tool: ${name}`);
        })
    } as unknown as Client;


    it('should generate correct topology from audit logs', async () => {
        const topology = await get_ecosystem_topology(mockAuditorClient);

        expect(topology).toBeDefined();
        expect(topology.nodes).toBeDefined();
        expect(topology.edges).toBeDefined();

        // Should include root + 2 spawned agencies
        expect(topology.nodes.length).toBe(3);

        const rootNode = topology.nodes.find(n => n.id === 'root');
        expect(rootNode).toBeDefined();
        expect(rootNode?.status).toBe('active');

        const alphaNode = topology.nodes.find(n => n.id === 'agency-alpha');
        expect(alphaNode).toBeDefined();
        expect(alphaNode?.parent).toBe('root');

        const betaNode = topology.nodes.find(n => n.id === 'agency-beta');
        expect(betaNode).toBeDefined();
        expect(betaNode?.parent).toBe('root');

        expect(topology.edges.length).toBe(2);
        expect(topology.edges).toEqual(expect.arrayContaining([
            { source: 'root', target: 'agency-alpha' },
            { source: 'root', target: 'agency-beta' }
        ]));
    });

    it('should fetch decision logs correctly', async () => {
        const logs = await get_ecosystem_decision_logs(mockAuditorClient, 'last_7_days', 'all');
        expect(logs).toBeDefined();
        expect(logs.length).toBe(4); // Should be all 4 mock events
        // Newest first
        expect(logs[0].event_type).toBe('policy_change');
        expect(logs[logs.length-1].event_type).toBe('morphology_adjustment');
    });

    it('should filter decision logs by focus area', async () => {
        const logs = await get_ecosystem_decision_logs(mockAuditorClient, 'last_7_days', 'communications');
        expect(logs.length).toBe(1);
        expect(logs[0].event_type).toBe('communication');
        expect(logs[0].description).toBe('Task delegated to agency-beta');
    });

    it('should filter decision logs by agency_id', async () => {
        const logs = await get_ecosystem_decision_logs(mockAuditorClient, 'last_7_days', 'all', 'agency-alpha');
        // Alpha is target in 1st spawn event, source in 3rd communication event
        expect(logs.length).toBe(2);
        expect(logs.some(l => l.event_type === 'communication')).toBe(true);
        expect(logs.some(l => l.event_type === 'morphology_adjustment')).toBe(true);
    });

    it('should throw error if auditor client is null', async () => {
        await expect(get_ecosystem_topology(null)).rejects.toThrow('Ecosystem Auditor client not connected');
        await expect(get_ecosystem_decision_logs(null)).rejects.toThrow('Ecosystem Auditor client not connected');
    });
});
