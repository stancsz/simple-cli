import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DreamingServer } from "../../src/mcp_servers/dreaming/index.js";
import { MCP } from "../../src/mcp.js";

// Mock MCP
vi.mock("../../src/mcp.js");

describe("Dreaming with Swarm Intelligence", () => {
    let server: DreamingServer;
    let mockMcp: any;
    let mockBrainClient: any;
    let mockSwarmClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockBrainClient = {
            callTool: vi.fn(),
        };
        mockSwarmClient = {
            callTool: vi.fn(),
        };

        mockMcp = {
            init: vi.fn().mockResolvedValue(undefined),
            getClient: vi.fn((name: string) => {
                if (name === "brain") return mockBrainClient;
                if (name === "swarm-server") return mockSwarmClient;
                return null;
            }),
        };

        (MCP as any).mockImplementation(() => mockMcp);

        server = new DreamingServer();
    });

    it("should negotiate specialized agents and simulate fixes for 3 diverse scenarios", async () => {
        // 1. Setup Mock Data (3 scenarios: UI, API, DevOps)
        const failures = [
            {
                id: "fail-1",
                taskId: "task-1",
                userPrompt: "Fix the React component styling bug",
                agentResponse: "Error: CSS module not found",
                simulation_attempts: [],
                resolved_via_dreaming: false
            },
            {
                id: "fail-2",
                taskId: "task-2",
                userPrompt: "Integrate Stripe API payment flow",
                agentResponse: "Error: Invalid API key format",
                simulation_attempts: [],
                resolved_via_dreaming: false
            },
            {
                id: "fail-3",
                taskId: "task-3",
                userPrompt: "Deploy to Kubernetes cluster",
                agentResponse: "Error: CrashLoopBackOff",
                simulation_attempts: [],
                resolved_via_dreaming: false
            }
        ];

        // 2. Setup Brain Mock to return failures
        mockBrainClient.callTool.mockImplementation(async (call: any) => {
            if (call.name === "brain_query") {
                return {
                    content: [{ text: JSON.stringify(failures) }]
                };
            }
            if (call.name === "brain_store") {
                return { content: [{ text: "Stored" }] };
            }
            if (call.name === "brain_delete_episode") {
                return { content: [{ text: "Deleted" }] };
            }
            return { content: [] };
        });

        // 3. Setup Swarm Mock for Idleness Check (idle), Negotiation, and Simulation
        mockSwarmClient.callTool.mockImplementation(async (call: any) => {
            if (call.name === "list_agents") {
                return { content: [{ text: "[]" }] }; // System idle
            }
            if (call.name === "negotiate_task") {
                expect(call.arguments.simulation_mode).toBe(true);
                const desc = call.arguments.task_description;
                let role = "Generalist";
                let strategy = "General fix";

                if (desc.includes("React")) {
                    role = "Frontend Specialist";
                    strategy = "Check css modules config";
                } else if (desc.includes("Stripe")) {
                    role = "Backend Integrator";
                    strategy = "Validate API keys";
                } else if (desc.includes("Kubernetes")) {
                    role = "DevOps Engineer";
                    strategy = "Check pod logs";
                }

                return {
                    content: [{
                        text: JSON.stringify({
                            winner_id: "sim-agent",
                            winning_bid: {
                                role: role,
                                rationale: "Scenario match"
                            },
                            strategy: strategy
                        })
                    }]
                };
            }
            if (call.name === "run_simulation") {
                const role = call.arguments.role;
                // Verify correct role is used
                if (["Frontend Specialist", "Backend Integrator", "DevOps Engineer"].includes(role)) {
                     return { content: [{ text: `Success: Fixed by ${role}.` }] };
                }
                return { content: [{ text: `Failure: Wrong role ${role}.` }] };
            }
            return { content: [] };
        });

        // 4. Run Dreaming Session
        const result: any = await server.startSession(3, "test-company");

        // 5. Assertions
        expect(result.content[0].text).toContain("Dreaming session complete");

        // Verify all 3 tasks were attempted and fixed
        expect(result.content[0].text).toContain("Fixed failure task-1 using role Frontend Specialist");
        expect(result.content[0].text).toContain("Fixed failure task-2 using role Backend Integrator");
        expect(result.content[0].text).toContain("Fixed failure task-3 using role DevOps Engineer");

        // Verify Brain Store calls
        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                taskId: "task-1",
                resolved_via_dreaming: true,
                dreaming_outcomes: expect.stringContaining("Frontend Specialist")
            })
        }));

        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                taskId: "task-2",
                resolved_via_dreaming: true,
                dreaming_outcomes: expect.stringContaining("Backend Integrator")
            })
        }));

        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                taskId: "task-3",
                resolved_via_dreaming: true,
                dreaming_outcomes: expect.stringContaining("DevOps Engineer")
            })
        }));
    });

    it("should handle negotiation failure by falling back to default role", async () => {
         const failures = [
            {
                id: "fail-4",
                taskId: "task-4",
                userPrompt: "Unknown error",
                agentResponse: "Unknown",
                simulation_attempts: [],
                resolved_via_dreaming: false
            }
        ];

        mockBrainClient.callTool.mockImplementation(async (call: any) => {
            if (call.name === "brain_query") return { content: [{ text: JSON.stringify(failures) }] };
            return { content: [{ text: "OK" }] };
        });

        mockSwarmClient.callTool.mockImplementation(async (call: any) => {
            if (call.name === "list_agents") return { content: [{ text: "[]" }] };
            if (call.name === "negotiate_task") {
                throw new Error("Negotiation service down");
            }
            if (call.name === "run_simulation") {
                 return { content: [{ text: "Success: Fixed it." }] };
            }
            return { content: [] };
        });

        await server.startSession(1);

        // Should fallback to Senior Developer
        expect(mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "run_simulation",
            arguments: expect.objectContaining({
                role: "Senior Developer"
            })
        }));
    });
});
