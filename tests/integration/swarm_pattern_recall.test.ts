import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwarmServer } from "../../src/mcp_servers/swarm/index.js";

// Mock LLM to prevent network calls/hangs
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: vi.fn().mockResolvedValue({
        thought: "Mock thought",
        message: "Mock message",
        tool: "none",
        args: {}
      }),
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0))
    }),
    LLM: class {}
  };
});

// Mock MCP to link Swarm and Brain
const mockCallTool = vi.fn();

vi.mock("../../src/mcp.js", () => {
  return {
    MCP: class {
      constructor() {}
      async init() {}
      getClient(name: string) {
        if (name === "brain") {
          return {
            callTool: mockCallTool
          };
        }
        return undefined;
      }
      listServers() { return [{ name: "brain", status: "running" }]; }
      async startServer() {}
    }
  };
});

describe("Swarm Pattern Recall Integration (Mocked Brain)", () => {
  let swarmServer: SwarmServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    swarmServer = new SwarmServer();
  });

  it("should recall and apply a stored swarm pattern", async () => {
    const pattern = {
        role: "Database Optimizer",
        strategy: "Index Analysis",
        rationale: "Requires deep SQL knowledge.",
        candidates: []
    };

    const task = "Fix slow SQL query in user dashboard";

    // Mock brain_query to return the pattern
    mockCallTool.mockImplementation(async ({ name, arguments: args }) => {
        if (name === "brain_query" && args.type === "swarm_negotiation_pattern") {
             // Return a mock episode
             const episode = {
                 id: "mock-id",
                 taskId: "pattern-1",
                 agentResponse: "Success",
                 dreaming_outcomes: JSON.stringify(pattern),
                 _distance: 0.1 // High similarity
             };
             return { content: [{ type: "text", text: JSON.stringify([episode]) }] };
        }
        return { content: [] };
    });

    const result = await swarmServer.negotiateTask([], task, false);
    const content = JSON.parse(result.content[0].text);

    // Verify
    expect(content.winner_id).toBe("simulation-agent"); // SwarmServer wrapper hardcodes this for simulation mode
    // Wait, in my manual test result was: "winner_id": "simulation-agent"
    // In Negotiator, I returned "winnerId": "pattern-recall".
    // SwarmServer ignores winnerId in simulation mode and sets it to "simulation-agent".
    // That's fine, as long as role/rationale are correct.

    expect(content.winning_bid.role).toBe("Database Optimizer");
    expect(content.winning_bid.rationale).toContain("Pattern Match");
    expect(content.strategy).toBe("Index Analysis");

    // Verify brain_query was called correctly
    expect(mockCallTool).toHaveBeenCalledWith({
        name: "brain_query",
        arguments: expect.objectContaining({
            query: task,
            type: "swarm_negotiation_pattern",
            format: "json"
        })
    });
  });

  it("should fallback to normal negotiation when no pattern matches", async () => {
    const task = "Build a frontend component";

    // Mock brain_query to return empty
    mockCallTool.mockImplementation(async ({ name }) => {
        return { content: [{ type: "text", text: "[]" }] };
    });

    const result = await swarmServer.negotiateTask([], task, false);
    const content = JSON.parse(result.content[0].text);

    expect(content.winning_bid.rationale).not.toContain("Pattern Match");
  });
});
