import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResourceAllocationTools } from '../../src/mcp_servers/business_ops/tools/resource_allocation.js';

// Define hoisted mocks
const { mockCollectMetrics, mockLinearClient } = vi.hoisted(() => {
    return {
        mockCollectMetrics: vi.fn(),
        mockLinearClient: {
            projects: vi.fn()
        }
    };
});

// Mock Dependencies
vi.mock('@linear/sdk', () => ({
    LinearClient: vi.fn(() => mockLinearClient)
}));

vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => ({
    getLinearClient: () => mockLinearClient
}));

vi.mock('../../src/mcp_servers/business_ops/tools/performance_analytics.js', () => ({
    collectPerformanceMetrics: mockCollectMetrics
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: vi.fn().mockResolvedValue({
            message: JSON.stringify([
                {
                    clientId: "proj1",
                    clientName: "Client A",
                    currentSwarmSize: 1,
                    recommendedSwarmSize: 2,
                    action: "scale_up",
                    justification: "High value client with backlog."
                },
                {
                    clientId: "proj2",
                    clientName: "Client B",
                    currentSwarmSize: 1,
                    recommendedSwarmSize: 1,
                    action: "maintain",
                    justification: "Low demand but stable."
                }
            ])
        })
    })
}));

describe('Resource Allocation Tool', () => {
    let server: McpServer;
    let toolHandler: any;

    beforeEach(() => {
        // Setup mock data
        const mockIssues = {
            nodes: [
                { id: "issue1", state: Promise.resolve({ type: "started" }) },
                { id: "issue2", state: Promise.resolve({ type: "backlog" }) }
            ]
        };

        const mockProjects = {
            nodes: [
                {
                    id: "proj1",
                    name: "Client A",
                    state: Promise.resolve({ type: "started" }),
                    issues: vi.fn().mockResolvedValue(mockIssues)
                },
                {
                    id: "proj2",
                    name: "Client B",
                    state: Promise.resolve({ type: "started" }),
                    issues: vi.fn().mockResolvedValue({ nodes: [] }) // Empty backlog
                }
            ]
        };

        mockLinearClient.projects.mockResolvedValue(mockProjects);

        mockCollectMetrics.mockResolvedValue({
            period: "last_30_days",
            financial: { revenue: 10000, profit: 3000, margin: 0.3, outstanding: 0 },
            delivery: { velocity: 10, cycleTime: 5, efficiency: 0.8, openIssues: 5, completedIssues: 10 },
            client: { nps: 80, churnRate: 0, activeClients: 1, satisfactionScore: 90 },
            timestamp: new Date().toISOString()
        });
        mockCollectMetrics.mockClear();

        server = new McpServer({ name: "test", version: "1.0.0" });
        // Spy on tool registration
        const toolSpy = vi.spyOn(server, 'tool');
        registerResourceAllocationTools(server);

        // Capture handler
        const call = toolSpy.mock.calls.find(c => c[0] === 'allocate_resources_optimally');
        expect(call).toBeDefined();
        if (call) {
             // @ts-ignore
            toolHandler = call[2] || call[3]; // SDK signature varies slightly in mocks sometimes, usually index 3 (handler)
            if (typeof toolHandler !== 'function') toolHandler = call[3];
        }
    });

    it('should aggregate data including metrics and generate allocation recommendations', async () => {
        const result = await toolHandler({});

        const content = JSON.parse(result.content[0].text);
        expect(Array.isArray(content)).toBe(true);
        expect(content.length).toBe(2);

        // Verify metrics were collected for each project
        expect(mockCollectMetrics).toHaveBeenCalledTimes(2);
        expect(mockCollectMetrics).toHaveBeenCalledWith("last_30_days", "proj1");
        expect(mockCollectMetrics).toHaveBeenCalledWith("last_30_days", "proj2");

        const clientA = content.find((c: any) => c.clientName === "Client A");
        expect(clientA).toBeDefined();
        expect(clientA.action).toBe("scale_up");
        expect(clientA.recommendedSwarmSize).toBe(2);

        const clientB = content.find((c: any) => c.clientName === "Client B");
        expect(clientB).toBeDefined();
        expect(clientB.action).toBe("maintain");
    });

    it('should handle no active projects gracefully', async () => {
        mockLinearClient.projects.mockResolvedValueOnce({ nodes: [] });

        const result = await toolHandler({});
        const content = JSON.parse(result.content[0].text);

        expect(content.message).toBe("No active clients found to allocate resources for.");
    });
});
