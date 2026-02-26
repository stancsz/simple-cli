import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSwarmFleetManagementTools } from '../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js';

// --- Mocks ---

const {
    mockLinearClientInstance,
    mockXeroClientInstance,
    mockScaleSwarmLogic,
    mockIssues,
    mockProjects,
    mockInvoices,
    mockContacts
} = vi.hoisted(() => {
    // Linear Mocks
    const _mockIssues = { nodes: [] as any[] };
    const _mockProject = {
        id: 'proj_1',
        name: 'Client A Project',
        updatedAt: new Date().toISOString(),
        issues: vi.fn().mockResolvedValue(_mockIssues)
    };
    const _mockProjects = { nodes: [_mockProject] };
    const _mockLinearClientInstance = {
        projects: vi.fn().mockResolvedValue(_mockProjects),
        project: vi.fn().mockReturnValue(_mockProject) // Added project() method just in case
    };

    // Xero Mocks
    const _mockInvoices = { body: { invoices: [] as any[] } };
    const _mockContacts = { body: { contacts: [{ contactID: 'contact_1' }] } };
    const _mockXeroClientInstance = {
        accountingApi: {
            getContacts: vi.fn().mockResolvedValue(_mockContacts),
            getInvoices: vi.fn().mockResolvedValue(_mockInvoices)
        }
    };

    // Scaling Logic Mock
    const _mockScaleSwarmLogic = vi.fn().mockResolvedValue({ status: "success", action: "spawn", result: "mocked" });

    return {
        mockLinearClientInstance: _mockLinearClientInstance,
        mockXeroClientInstance: _mockXeroClientInstance,
        mockScaleSwarmLogic: _mockScaleSwarmLogic,
        mockIssues: _mockIssues,
        mockProjects: _mockProjects,
        mockInvoices: _mockInvoices,
        mockContacts: _mockContacts
    };
});

vi.mock('@linear/sdk', () => {
    return {
        LinearClient: vi.fn(() => mockLinearClientInstance)
    };
});

vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => {
    return {
        getXeroClient: vi.fn().mockResolvedValue(mockXeroClientInstance),
        getTenantId: vi.fn().mockResolvedValue('tenant_1')
    };
});

vi.mock('../../src/mcp_servers/scaling_engine/scaling_orchestrator.js', () => {
    return {
        scaleSwarmLogic: mockScaleSwarmLogic
    };
});

// Mock MCP Client
const mockMcpClient = {
    init: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn().mockReturnValue({ callTool: vi.fn() })
};

// Mock McpServer
const mockServer = {
    tool: vi.fn((name, desc, schema, handler) => {
        // @ts-ignore
        mockServer.tools[name] = handler;
    }),
    tools: {} as Record<string, Function>
};

describe('Swarm Fleet Management Integration', () => {

    beforeEach(() => {
        process.env.LINEAR_API_KEY = "mock_key";
        // @ts-ignore
        mockServer.tools = {};
        vi.clearAllMocks();

        // Reset default mock returns
        mockIssues.nodes = [];

        // Reset projects
        const defaultProject = {
            id: 'proj_1',
            name: 'Client A Project',
            updatedAt: new Date().toISOString(),
            issues: vi.fn().mockResolvedValue(mockIssues)
        };
        mockProjects.nodes = [defaultProject];

        mockInvoices.body.invoices = [];
    });

    it('should register tools correctly', () => {
        registerSwarmFleetManagementTools(mockServer as any, mockMcpClient as any);
        expect(mockServer.tool).toHaveBeenCalledTimes(3);
        expect(mockServer.tools).toHaveProperty('get_fleet_status');
        expect(mockServer.tools).toHaveProperty('evaluate_fleet_demand');
        expect(mockServer.tools).toHaveProperty('balance_fleet_resources');
    });

    it('get_fleet_status should return active swarms overview', async () => {
        registerSwarmFleetManagementTools(mockServer as any, mockMcpClient as any);
        const tool = mockServer.tools['get_fleet_status'];

        // Setup: 2 active projects
        const proj1 = {
            id: "p1",
            name: "Client A",
            updatedAt: new Date().toISOString(),
            issues: vi.fn().mockResolvedValue({ nodes: Array(3).fill({}) })
        };
        const proj2 = {
            id: "p2",
            name: "Client B",
            updatedAt: new Date().toISOString(),
            issues: vi.fn().mockResolvedValue({ nodes: Array(12).fill({}) })
        };
        mockProjects.nodes = [proj1, proj2];

        const result = await tool({});
        const data = JSON.parse(result.content[0].text);

        expect(data).toHaveLength(2);
        expect(data[0].company).toBe("Client A");
        expect(data[0].pending_issues).toBe(3);
        expect(data[0].health).toBe("healthy");

        expect(data[1].company).toBe("Client B");
        expect(data[1].pending_issues).toBe(12);
        expect(data[1].health).toBe("strained");
    });

    it('evaluate_fleet_demand should recommend scaling based on demand and revenue', async () => {
        registerSwarmFleetManagementTools(mockServer as any, mockMcpClient as any);
        const tool = mockServer.tools['evaluate_fleet_demand'];

        // Setup: Client A (High Demand, Low Revenue) -> Scale Up
        // Setup: Client B (Low Demand, High Revenue) -> Maintain/Scale Down

        const projA = {
            id: "p1",
            name: "Client A",
            updatedAt: new Date().toISOString(),
            issues: vi.fn().mockResolvedValue({ nodes: Array(6).fill({}) })
        };

        const projB = {
            id: "p2",
            name: "Client B",
            updatedAt: new Date().toISOString(),
            issues: vi.fn().mockResolvedValue({ nodes: [] })
        };

        mockProjects.nodes = [projA, projB];

        // Mock Xero Revenue
        mockXeroClientInstance.accountingApi.getInvoices.mockImplementation(async (tid, date, where) => {
            if (where.includes("cid_A")) return { body: { invoices: [{ total: 100 }] } };
            if (where.includes("cid_B")) return { body: { invoices: [{ total: 10000 }] } };
            return { body: { invoices: [] } };
        });

        // Mock Xero Contacts to match names
        mockXeroClientInstance.accountingApi.getContacts.mockImplementation(async (tid, date, where) => {
            if (where.includes("Client A")) return { body: { contacts: [{ contactID: "cid_A" }] } };
            if (where.includes("Client B")) return { body: { contacts: [{ contactID: "cid_B" }] } };
            return { body: { contacts: [] } };
        });

        const result = await tool({ profitability_weight: 0.5, demand_threshold: 5 });
        const data = JSON.parse(result.content[0].text);

        const recA = data.recommendations.find((r: any) => r.company === "Client A");
        const recB = data.recommendations.find((r: any) => r.company === "Client B");

        expect(recA.recommendation).toBe("scale_up");
        expect(recA.metrics.issues).toBe(6);

        expect(recB.recommendation).toBe("scale_down");
        expect(recB.metrics.issues).toBe(0);

        expect(recB.metrics.score).toBeGreaterThan(recA.metrics.score);
    });

    it('balance_fleet_resources should trigger scaleSwarmLogic based on priority', async () => {
        registerSwarmFleetManagementTools(mockServer as any, mockMcpClient as any);
        const tool = mockServer.tools['balance_fleet_resources'];

        const evaluations = [
            {
                company: "Client LowPri",
                recommendation: "scale_up",
                metrics: { score: 1.0 }
            },
            {
                company: "Client HighPri",
                recommendation: "scale_up",
                metrics: { score: 10.0 }
            },
            {
                company: "Client Maintain",
                recommendation: "maintain",
                metrics: { score: 5.0 }
            }
        ];

        const result = await tool({ evaluations });
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe("success");
        expect(data.actions_taken).toHaveLength(2); // HighPri and LowPri

        // Since we iterate in order, let's check the call order
        // HighPri (10) should be called first, then LowPri (1)
        expect(mockScaleSwarmLogic).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            "Client HighPri",
            "spawn",
            "specialist",
            "Assist with backlog"
        );

        expect(mockScaleSwarmLogic).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            "Client LowPri",
            "spawn",
            "specialist",
            "Assist with backlog"
        );
    });
});
