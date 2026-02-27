import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP } from '../../src/mcp.js';
import { CorporatePolicy } from '../../src/brain/schemas.js';

// Setup mocks first
const mockEpisodicStore = vi.fn();
const mockEpisodicRecall = vi.fn();

vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                store: mockEpisodicStore,
                recall: mockEpisodicRecall
            };
        })
    };
});

vi.mock('../../src/mcp.js');

const mockLinearProjects = {
    nodes: [
        {
            id: "proj_1",
            name: "Alpha Corp",
            state: Promise.resolve({ type: "active" }),
            updatedAt: new Date(),
            issues: vi.fn().mockResolvedValue({ nodes: [{}, {}, {}] })
        },
        {
            id: "proj_2",
            name: "Beta Inc",
            state: Promise.resolve({ type: "active" }),
            updatedAt: new Date(),
            issues: vi.fn().mockResolvedValue({ nodes: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] })
        }
    ]
};

vi.mock('@linear/sdk', () => {
    return {
        LinearClient: vi.fn().mockImplementation(() => ({
            projects: vi.fn().mockResolvedValue(mockLinearProjects)
        }))
    };
});

describe('Federated Policy Engine Integration', () => {
    let server: McpServer;
    let registeredTools: Map<string, Function> = new Map();
    // We need to dynamically import modules inside tests or beforeEach to ensure mocks are used
    let registerPolicyEngineTools: any;
    let registerSwarmFleetManagementTools: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        registeredTools.clear();
        mockEpisodicStore.mockResolvedValue(undefined);
        mockEpisodicRecall.mockResolvedValue([]);

        process.env.LINEAR_API_KEY = "test_key"; // Fix missing API Key error

        // Import modules here
        const policyModule = await import('../../src/mcp_servers/business_ops/tools/policy_engine.js');
        registerPolicyEngineTools = policyModule.registerPolicyEngineTools;

        const fleetModule = await import('../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js');
        registerSwarmFleetManagementTools = fleetModule.registerSwarmFleetManagementTools;

        server = new McpServer({ name: "test_server", version: "1.0.0" });

        const originalTool = server.tool.bind(server);
        vi.spyOn(server, 'tool').mockImplementation((name, description, schema, handler) => {
            registeredTools.set(name, handler);
            return originalTool(name, description, schema, handler);
        });

        registerPolicyEngineTools(server);
        registerSwarmFleetManagementTools(server, new MCP());
    });

    const callTool = async (name: string, args: any) => {
        const handler = registeredTools.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return await handler(args);
    };

    it('should allow C-Suite agent to update operating policy', async () => {
        const params = {
            name: "Q4 Conservative Policy",
            description: "Tighten margins for Q4.",
            min_margin: 0.3,
            risk_tolerance: "low",
            max_agents_per_swarm: 10,
            company: "Alpha Corp"
        };

        const result = await callTool("update_operating_policy", params);

        expect(mockEpisodicStore).toHaveBeenCalled();
        const storedCall = mockEpisodicStore.mock.calls[0];

        expect(storedCall[0]).toContain("policy_update");
        const storedPolicy = JSON.parse(storedCall[2]);
        expect(storedPolicy.name).toBe("Q4 Conservative Policy");
        expect(storedPolicy.version).toBe(1);
        expect(storedPolicy.parameters.risk_tolerance).toBe("low");
        expect(storedCall[4]).toBe("Alpha Corp");

        const output = JSON.parse(result.content[0].text);
        expect(output.status).toBe("success");
        expect(output.policy.version).toBe(1);
    });

    it('should retrieve the active policy and apply it to fleet status', async () => {
        const existingPolicy: CorporatePolicy = {
            id: "policy_123",
            version: 2,
            name: "Growth Policy",
            description: "High risk, high reward.",
            parameters: {
                min_margin: 0.1,
                risk_tolerance: "high",
                max_agents_per_swarm: 20
            },
            isActive: true,
            timestamp: Date.now(),
            author: "CEO"
        };

        mockEpisodicRecall.mockResolvedValue([{
            agentResponse: JSON.stringify(existingPolicy),
            userPrompt: "policy update",
            timestamp: Date.now(),
            id: "policy_123"
        }]);

        const statusResult = await callTool("get_fleet_status", {});

        // Debugging output if needed
        if (statusResult.isError) {
             console.error(statusResult.content[0].text);
        }

        const status = JSON.parse(statusResult.content[0].text);

        expect(status).toHaveLength(2);

        const alpha = status.find((s: any) => s.company === "Alpha Corp");
        expect(alpha.policy_version).toBe(2);
        expect(alpha.active_policy_summary).toContain("Growth Policy");
        expect(alpha.compliance_status).toBe("compliant");

        const beta = status.find((s: any) => s.company === "Beta Inc");
        expect(beta.health).toBe("strained");
        expect(beta.compliance_status).toBe("compliant");
    });

    it('should detect policy violations', async () => {
         const lowRiskPolicy: CorporatePolicy = {
             id: "policy_low",
             version: 3,
             name: "Safety First",
             description: "Safety.",
             parameters: {
                 min_margin: 0.2,
                 risk_tolerance: "low",
                 max_agents_per_swarm: 5
             },
             isActive: true,
             timestamp: Date.now(),
             author: "CEO"
         };

         mockEpisodicRecall.mockResolvedValue([{
             agentResponse: JSON.stringify(lowRiskPolicy),
             userPrompt: "policy update",
             timestamp: Date.now(),
             id: "policy_low"
         }]);

         const statusResult = await callTool("get_fleet_status", {});
         const status = JSON.parse(statusResult.content[0].text);

         const beta = status.find((s: any) => s.company === "Beta Inc");
         expect(beta.compliance_status).toBe("violation");
         expect(beta.violations[0]).toContain("Swarm health is strained while risk tolerance is LOW");
    });

    it('should rollback policy correctly', async () => {
        const policyV1: CorporatePolicy = {
            id: "p_v1", version: 1, name: "V1", description: "Old", parameters: {} as any, isActive: true, timestamp: 1000, author: "Me"
        };
        const policyV2: CorporatePolicy = {
            id: "p_v2", version: 2, name: "V2", description: "New", parameters: {} as any, isActive: true, timestamp: 2000, author: "Me", previous_version_id: "p_v1"
        };

        mockEpisodicRecall.mockResolvedValue([
             { agentResponse: JSON.stringify(policyV2), id: "p_v2" }, // Correct ID
             { agentResponse: JSON.stringify(policyV1), id: "p_v1" }  // Correct ID
        ]);

        const result = await callTool("rollback_operating_policy", { company: "default" });

        if (result.isError) {
             console.error(result.content[0].text);
        }

        const output = JSON.parse(result.content[0].text);

        expect(output.status).toBe("success");
        expect(output.policy.version).toBe(3);
        expect(output.policy.description).toContain("Rollback to version 1");
        expect(mockEpisodicStore).toHaveBeenCalled();
    });
});
