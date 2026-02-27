import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResourceAllocationTools } from '../../src/mcp_servers/business_ops/tools/resource_allocation.js';
import { MCP } from '../../src/mcp.js';
import { z } from "zod";

// Mock Dependencies
const mockLinearClient = {
    projects: vi.fn(),
    project: vi.fn(),
    issues: vi.fn(),
};

const mockXeroClient = {
    accountingApi: {
        getContacts: vi.fn(),
        getInvoices: vi.fn(),
    }
};

const mockLLM = {
    generate: vi.fn(),
};

const mockEpisodicMemory = {
    init: vi.fn(),
    recall: vi.fn(),
};

const mockMcpClient = {
    init: vi.fn(),
    getClient: vi.fn(),
    callTool: vi.fn(),
};

// Hoist mocks
vi.mock('@linear/sdk', () => ({
    LinearClient: vi.fn(() => mockLinearClient)
}));

vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => ({
    getXeroClient: vi.fn(() => Promise.resolve(mockXeroClient)),
    getTenantId: vi.fn(() => Promise.resolve('mock-tenant-id'))
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn(() => mockLLM)
}));

vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn(() => mockEpisodicMemory)
}));

vi.mock('../../src/mcp.js', () => ({
    MCP: vi.fn(() => mockMcpClient)
}));

vi.mock('../../src/mcp_servers/scaling_engine/scaling_orchestrator.js', () => ({
    scaleSwarmLogic: vi.fn()
}));

vi.mock('../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js', () => ({
    getFleetStatusLogic: vi.fn(),
    registerSwarmFleetManagementTools: vi.fn()
}));

vi.mock('../../src/mcp_servers/business_ops/tools/performance_analytics.js', () => ({
    collectPerformanceMetrics: vi.fn()
}));

// Import executed mock
import { scaleSwarmLogic } from '../../src/mcp_servers/scaling_engine/scaling_orchestrator.js';
import { getFleetStatusLogic } from '../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js';
import { collectPerformanceMetrics } from '../../src/mcp_servers/business_ops/tools/performance_analytics.js';

describe('Resource Allocation Validation', () => {
    let server: McpServer;
    let toolHandler: Function;

    beforeEach(() => {
        vi.clearAllMocks();

        server = new McpServer({ name: 'test-server', version: '1.0.0' });

        // Spy on tool registration to capture handler
        const toolSpy = vi.spyOn(server, 'tool');
        registerResourceAllocationTools(server, mockMcpClient as any);

        // Capture the handler for 'allocate_resources_optimally'
        const callArgs = toolSpy.mock.calls.find(call => call[0] === 'allocate_resources_optimally');
        if (!callArgs) throw new Error("Tool not registered");
        // @ts-ignore
        toolHandler = callArgs[3]; // [name, desc, schema, handler]

        // Setup common mocks
        (getFleetStatusLogic as any).mockResolvedValue([
            { company: "Client A", projectId: "proj-1", active_agents: 1, pending_issues: 10, health: "strained" }
        ]);

        (collectPerformanceMetrics as any).mockResolvedValue({
            financial: { revenue: 5000, profit: 1500, margin: 0.3 }
        });

        mockMcpClient.getClient.mockReturnValue({
            callTool: vi.fn().mockResolvedValue({ content: [{ text: "System Health: Good, CPU 20%" }] })
        });

        mockEpisodicMemory.recall.mockResolvedValue([{ content: "Urgent issue with login" }]);
    });

    it('should generate an allocation plan in dry-run mode', async () => {
        // Mock LLM Response
        const plan = [
            { company: "Client A", action: "scale_up", reason: "High demand", role: "specialist" }
        ];
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(plan)
        });

        const result = await toolHandler({ dry_run: true });
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe('success');
        expect(content.mode).toBe('dry_run');
        expect(content.plan).toEqual(plan);
        expect(content.execution_results).toBeUndefined();
        expect(scaleSwarmLogic).not.toHaveBeenCalled();
    });

    it('should execute scaling actions when dry_run is false', async () => {
        // Mock LLM Response
        const plan = [
            { company: "Client A", action: "scale_up", reason: "High demand", role: "specialist", task: "Fix login" }
        ];
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(plan)
        });

        // Mock Execution
        (scaleSwarmLogic as any).mockResolvedValue({ success: true, agentId: 'agent-1' });

        const result = await toolHandler({ dry_run: false });
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe('success');
        expect(content.mode).toBe('execution');
        expect(content.execution_results).toHaveLength(1);
        expect(content.execution_results[0].company).toBe("Client A");
        expect(content.execution_results[0].status).toBe("success");

        expect(scaleSwarmLogic).toHaveBeenCalledWith(
            expect.anything(),
            "Client A",
            "spawn",
            "specialist",
            "Fix login"
        );
    });

    it('should handle system health failures gracefully', async () => {
         mockMcpClient.getClient.mockReturnValue({
            callTool: vi.fn().mockRejectedValue(new Error("Health Monitor Down"))
        });

        const plan = [{ company: "Client A", action: "maintain" }];
        mockLLM.generate.mockResolvedValue({ message: JSON.stringify(plan) });

        const result = await toolHandler({ dry_run: true });
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe('success');
        // Logs should contain warning
        expect(JSON.stringify(content.logs)).toContain("Failed to fetch system health");
    });

    it('should skip scale_down actions with a reason', async () => {
         // Setup for scale down test
        (getFleetStatusLogic as any).mockResolvedValue([
            { company: "Client A", projectId: "proj-1", active_agents: 3, pending_issues: 0, health: "healthy" }
        ]);

         const plan = [
            { company: "Client A", action: "scale_down", reason: "Low demand" }
        ];
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(plan)
        });

        const result = await toolHandler({ dry_run: false });
        const content = JSON.parse(result.content[0].text);

        expect(content.execution_results[0].status).toBe("skipped");
        expect(content.execution_results[0].reason).toContain("requires specific agent ID");
    });
});
