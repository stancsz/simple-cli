import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { DreamingServer } from "../../src/mcp_servers/dreaming/index.js";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { randomUUID } from "crypto";

const TEST_DIR = join(process.cwd(), "test_dreaming_enhanced_" + Date.now());

// Mock MCP
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();

vi.mock("../../src/mcp.js", () => {
    return {
        MCP: vi.fn().mockImplementation(() => {
            return {
                init: vi.fn().mockResolvedValue(undefined),
                getClient: mockGetClient
            };
        })
    };
});

// Mock LLM to prevent actual embeddings and calls
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: async (text: string) => new Array(1536).fill(0.1),
            complete: async () => "Mock completion"
        })
    };
});

describe("Enhanced Dreaming Integration", () => {
    let memory: EpisodicMemory;
    let dreamingServer: DreamingServer;

    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });

        // Initialize Memory with test dir
        memory = new EpisodicMemory(TEST_DIR);
        await memory.init(); // Ensure default connector

        // Initialize Dreaming Server
        dreamingServer = new DreamingServer();

        // Reset mocks
        mockCallTool.mockReset();
        mockGetClient.mockReset();

        // Setup Brain Client Mock (wraps our memory instance)
        const mockBrainClient = {
            callTool: async (tool: { name: string, arguments: any }) => {
                if (tool.name === "brain_query") {
                    const { query, limit, company, type } = tool.arguments;
                    const results = await memory.recall(query, limit, company, type);
                    // Format like BrainServer
                     if (tool.arguments.format === "json") {
                        return { content: [{ type: "text", text: JSON.stringify(results) }] };
                     }
                     return { content: [{ type: "text", text: JSON.stringify(results) }] }; // fallback
                }
                if (tool.name === "brain_store") {
                    const args = tool.arguments;
                    let artifacts = [];
                    if (args.artifacts) {
                        try { artifacts = JSON.parse(args.artifacts); } catch {}
                    }
                    let attempts = undefined;
                    if (args.simulation_attempts) {
                         try { attempts = JSON.parse(args.simulation_attempts); } catch {}
                    }
                     await memory.store(
                        args.taskId, args.request, args.solution, artifacts, args.company,
                        attempts, args.resolved_via_dreaming, args.dreaming_outcomes, args.id,
                        args.tokens, args.duration, args.type, args.related_episode_id
                    );
                    return { content: [{ type: "text", text: "Stored" }] };
                }
                if (tool.name === "brain_delete_episode") {
                    await memory.delete(tool.arguments.id, tool.arguments.company);
                    return { content: [{ type: "text", text: "Deleted" }] };
                }
                return { content: [] };
            }
        };

        // Setup Swarm Client Mock
        const mockSwarmClient = {
            callTool: async (tool: { name: string, arguments: any }) => {
                if (tool.name === "list_agents") {
                     // Return empty list to simulate idle
                     return { content: [{ type: "text", text: "[]" }] };
                }
                if (tool.name === "negotiate_task") {
                    // Return a winning bid
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                winning_bid: { role: "Security Specialist", rationale: "Best for auth" },
                                strategy: "Audit token validation logic",
                                candidates: []
                            })
                        }]
                    };
                }
                if (tool.name === "run_simulation") {
                    // Return success
                    return { content: [{ type: "text", text: "Simulation Success: Fixed the auth bug." }] };
                }
                return { content: [] };
            }
        };

        mockGetClient.mockImplementation((name: string) => {
            if (name === "brain") return mockBrainClient;
            if (name === "swarm-server") return mockSwarmClient;
            return null;
        });
    });

    afterEach(async () => {
        try {
            await rm(TEST_DIR, { recursive: true, force: true });
        } catch (e) {
            console.warn("Failed to cleanup test dir:", e);
        }
    });

    it("should store a swarm negotiation pattern after successful dreaming", async () => {
        const failureId = randomUUID();
        const failureTaskId = "task-fail-001";

        // 1. Store a failure episode
        await memory.store(
            failureTaskId,
            "Fix auth bug in login",
            "Error: Invalid token",
            [],
            undefined, // company
            undefined, // attempts
            false, // resolved
            undefined,
            failureId
        );

        // Verify it exists
        const initial = await memory.recall("Fix auth bug");
        expect(initial.length).toBeGreaterThan(0);
        expect(initial[0].taskId).toBe(failureTaskId);

        // 2. Trigger Dreaming
        const result = await dreamingServer.startSession(1);

        expect(result.content[0].text).toContain("Dreaming session complete");
        expect(result.content[0].text).toContain(`Fixed failure ${failureTaskId}`);

        // 3. Verify original failure is resolved (deleted and re-stored as resolved)
        const resolved = await memory.recall("Fix auth bug");
        const resolvedEpisode = resolved.find(r => r.taskId === failureTaskId && r.resolved_via_dreaming);
        expect(resolvedEpisode).toBeDefined();
        expect(resolvedEpisode?.agentResponse).toContain("[Dreaming Resolved]");

        // 4. Verify Negotiation Pattern exists
        const patterns = await memory.recall("Swarm Negotiation", 10, undefined, "swarm_negotiation_pattern");
        expect(patterns.length).toBeGreaterThan(0);

        const pattern = patterns.find(p => p.related_episode_id === failureId);
        expect(pattern).toBeDefined();
        expect(pattern?.type).toBe("swarm_negotiation_pattern");
        expect(pattern?.agentResponse).toContain("Security Specialist");
        expect(pattern?.agentResponse).toContain("Audit token validation logic");

        // Check negotiation data is stored
        if (pattern?.dreaming_outcomes) {
             const outcomes = JSON.parse(pattern.dreaming_outcomes);
             expect(outcomes.winning_bid.role).toBe("Security Specialist");
        } else {
            throw new Error("dreaming_outcomes missing in pattern");
        }
    });
});
