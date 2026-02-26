import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerScalingTools } from '../../src/mcp_servers/scaling_engine/scaling_orchestrator.js';

// Mock LinearClient
const mockIssues = { nodes: [] as any[] };
const mockProject = {
    issues: vi.fn().mockResolvedValue(mockIssues)
};
const mockLinearClient = {
    project: vi.fn().mockResolvedValue(mockProject)
};

vi.mock('@linear/sdk', () => {
    return {
        LinearClient: vi.fn(() => mockLinearClient)
    };
});

// Mock MCP Client
const mockBrainClient = {
    callTool: vi.fn().mockResolvedValue("Mock memory recall")
};
const mockSwarmClient = {
    callTool: vi.fn().mockResolvedValue("Mock swarm action")
};

const mockMcpClient = {
    init: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn((name) => {
        if (name === "brain") return mockBrainClient;
        if (name === "swarm-server" || name === "swarm") return mockSwarmClient;
        return undefined;
    })
};

// Mock McpServer
const mockServer = {
    tool: vi.fn((name, desc, schema, handler) => {
        mockServer.tools[name] = handler;
    }),
    tools: {} as Record<string, Function>
};

describe('Scaling Engine Integration', () => {

    beforeEach(() => {
        process.env.LINEAR_API_KEY = "mock_key";
        mockServer.tools = {};
        vi.clearAllMocks();
    });

    it('should register tools correctly', () => {
        registerScalingTools(mockServer as any, mockMcpClient as any);
        expect(mockServer.tool).toHaveBeenCalledTimes(2);
        expect(mockServer.tools).toHaveProperty('evaluate_demand');
        expect(mockServer.tools).toHaveProperty('scale_swarm');
    });

    it('evaluate_demand should detect high demand', async () => {
        registerScalingTools(mockServer as any, mockMcpClient as any);
        const evaluateTool = mockServer.tools['evaluate_demand'];

        // Simulate high load
        mockIssues.nodes = Array(10).fill({ id: 'issue-1' });

        const result = await evaluateTool({ project_id: "proj_123", threshold_issues: 5 });
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe("success");
        expect(data.demand_level).toBe("high");
        expect(data.recommendation).toBe("scale_up");
        expect(mockLinearClient.project).toHaveBeenCalledWith("proj_123");
        expect(mockMcpClient.getClient).toHaveBeenCalledWith("brain");
    });

    it('evaluate_demand should detect low demand', async () => {
        registerScalingTools(mockServer as any, mockMcpClient as any);
        const evaluateTool = mockServer.tools['evaluate_demand'];

        // Simulate no load
        mockIssues.nodes = [];

        const result = await evaluateTool({ project_id: "proj_123" });
        const data = JSON.parse(result.content[0].text);

        expect(data.demand_level).toBe("normal"); // threshold defaults to 5
        expect(data.recommendation).toBe("scale_down");
    });

    it('scale_swarm should spawn agent', async () => {
        registerScalingTools(mockServer as any, mockMcpClient as any);
        const scaleTool = mockServer.tools['scale_swarm'];

        const result = await scaleTool({
            client_id: "client_ABC",
            action: "spawn",
            role: "Frontend Dev",
            task: "Fix UI"
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe("success");
        expect(data.action).toBe("spawn");
        expect(mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "spawn_subagent",
            arguments: expect.objectContaining({
                role: "Frontend Dev",
                company_id: "client_ABC"
            })
        }));
        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "log_experience"
        }));
    });

    it('scale_swarm should terminate agent', async () => {
        registerScalingTools(mockServer as any, mockMcpClient as any);
        const scaleTool = mockServer.tools['scale_swarm'];

        const result = await scaleTool({
            client_id: "client_ABC",
            action: "terminate",
            agent_id: "agent_XYZ"
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe("success");
        expect(data.action).toBe("terminate");
        expect(mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "terminate_agent",
            arguments: expect.objectContaining({
                agent_id: "agent_XYZ"
            })
        }));
    });
});
