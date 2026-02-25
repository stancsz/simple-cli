import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DreamingServer } from "../../src/mcp_servers/dreaming/index.js";

// Mock dependencies
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();

vi.mock("../../src/mcp.js", () => {
    return {
        MCP: class {
            init = vi.fn().mockResolvedValue(undefined);
            getClient = mockGetClient;
        }
    };
});

// Mock console.error/warn to keep output clean
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe("Dreaming Swarm Integration", () => {
    let server: DreamingServer;

    beforeEach(() => {
        vi.clearAllMocks();
        console.error = vi.fn();
        console.warn = vi.fn();

        // Setup mock clients
        mockGetClient.mockImplementation((serverName: string) => {
            if (serverName === "swarm-server" || serverName === "brain") {
                return {
                    callTool: mockCallTool
                };
            }
            return null;
        });

        server = new DreamingServer();
    });

    afterEach(() => {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
    });

    it("should negotiate task via Swarm and resolve failure in Brain", async () => {
        // 1. Mock Swarm: Idle check
        mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "[]" }] // Empty agent list -> Idle
        });

        // 2. Mock Brain: Query Failures
        const failureEpisode = {
            id: "fail-123",
            taskId: "task-abc",
            userPrompt: "Fix the bug",
            agentResponse: "Error: undefined",
            simulation_attempts: []
        };
        mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify([failureEpisode]) }]
        });

        // 3. Mock Swarm: Negotiate Task (Simulation Mode)
        const negotiationResult = {
            winning_bid: {
                role: "Bug Fix Specialist",
                rationale: "Expert in bugs",
                strategy: "Check logs"
            },
            strategy: "Check logs",
            candidates: [
                { role: "Bug Fix Specialist", score: 90 },
                { role: "Generalist", score: 50 }
            ]
        };
        mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify(negotiationResult) }]
        });

        // 4. Mock Swarm: Run Simulation
        mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "Simulation Success: Bug fixed." }]
        });

        // 5. Mock Brain: Delete Old Episode
        mockCallTool.mockResolvedValueOnce({ content: [] });

        // 6. Mock Brain: Store New Episode
        mockCallTool.mockResolvedValueOnce({ content: [] });

        // 7. Mock Brain: Store Negotiation Pattern
        mockCallTool.mockResolvedValueOnce({ content: [] });

        // Execute
        const result = await server.startSession(1);

        // Verify
        // 1. Check Idleness
        expect(mockGetClient).toHaveBeenCalledWith("swarm-server");
        expect(mockCallTool).toHaveBeenNthCalledWith(1, { name: "list_agents", arguments: {} });

        // 2. Check Query Failures
        expect(mockGetClient).toHaveBeenCalledWith("brain");
        expect(mockCallTool).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "brain_query" }));

        // 3. Check Negotiation
        expect(mockCallTool).toHaveBeenNthCalledWith(3, expect.objectContaining({
            name: "negotiate_task",
            arguments: expect.objectContaining({
                simulation_mode: true,
                task_description: expect.stringContaining("Fix failure: Fix the bug")
            })
        }));

        // 4. Check Simulation
        expect(mockCallTool).toHaveBeenNthCalledWith(4, expect.objectContaining({
            name: "run_simulation",
            arguments: expect.objectContaining({
                role: "Bug Fix Specialist"
            })
        }));

        // 5. Check Storage of Dreaming Outcomes
        // Note: calls are sequential.
        // 1: list_agents
        // 2: brain_query
        // 3: negotiate_task
        // 4: run_simulation
        // 5: brain_delete_episode
        // 6: brain_store (Resolved Episode)
        expect(mockCallTool).toHaveBeenNthCalledWith(6, expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                resolved_via_dreaming: true,
                dreaming_outcomes: expect.stringContaining("Bug Fix Specialist")
            })
        }));

        // 7: brain_store (Negotiation Pattern)
        expect(mockCallTool).toHaveBeenNthCalledWith(7, expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                type: "swarm_negotiation_pattern",
                related_episode_id: "fail-123",
                dreaming_outcomes: expect.stringContaining("Bug Fix Specialist")
            })
        }));

        // Also verify candidates are in dreaming_outcomes (from resolved episode)
        const resolvedCallArgs = mockCallTool.mock.calls[5][0];
        expect(resolvedCallArgs.arguments.dreaming_outcomes).toContain("candidates");
        expect(resolvedCallArgs.arguments.dreaming_outcomes).toContain("Generalist");

        // Verify result text
        expect(result.content[0].text).toContain("Fixed failure task-abc using role Bug Fix Specialist");
    });
});
