import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Engine, Context, Registry } from "../../src/engine/orchestrator.js";
import { LLM } from "../../src/llm.js";
import { MCP } from "../../src/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

// Mock LLM
class MockLLM extends LLM {
  constructor() {
    super({ provider: "mock", model: "mock" });
  }

  async generate(system: string, history: any[], signal?: AbortSignal) {
    // Determine response based on history
    const lastMsg = history[history.length - 1];

    if (lastMsg.role === "user" && lastMsg.content.includes("Fix the bug")) {
        // First turn: call aider
        return {
            thought: "I should use aider.",
            tool: "aider_chat",
            args: { message: "Fix bug in file.ts" },
            message: "Calling aider...",
            raw: "",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // Second turn: verify (Supervisor)
    if (lastMsg.role === "user" && lastMsg.content.includes("Analyze the result")) {
        return {
            thought: "It looks good.",
            tool: "none",
            args: {},
            message: "Verified.",
            raw: "",
             usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    return {
        thought: "Done.",
        tool: "none",
        args: {},
        message: "Task completed.",
        raw: "",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }
}

describe("Brain Integration", () => {
  let engine: Engine;
  let mcp: MCP;
  let brainClient: Client;
  let registry: Registry;

  beforeEach(async () => {
    // Start Brain Server (actual process)
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["tsx", "src/mcp_servers/brain.ts"],
        env: { ...process.env, PATH: process.env.PATH, MODEL: "mock:mock" }
    });

    brainClient = new Client({ name: "test", version: "1.0" }, { capabilities: {} });
    await brainClient.connect(transport);

    // Mock MCP to return our brainClient
    mcp = new MCP();
    vi.spyOn(mcp, "init").mockResolvedValue(undefined);
    vi.spyOn(mcp, "listServers").mockReturnValue([{ name: "brain", status: "running", source: "local" }]);
    vi.spyOn(mcp, "isServerRunning").mockReturnValue(true);
    vi.spyOn(mcp, "getClient").mockImplementation((name) => {
        if (name === "brain") return brainClient;
        return undefined;
    });
    vi.spyOn(mcp, "getTools").mockResolvedValue([]);

    registry = new Registry();
    // Register mock aider tool
    registry.tools.set("aider_chat", {
        name: "aider_chat",
        description: "Aider chat",
        execute: async () => ({ content: [{ type: "text", text: "Fixed." }] })
    });

    const llm = new MockLLM();
    engine = new Engine(llm, registry, mcp);
  });

  afterEach(async () => {
    await brainClient.close();
    vi.restoreAllMocks();
  });

  it("should track Orchestrator reads and Agent writes", async () => {
    const ctx = new Context(process.cwd(), {
        name: "test",
        description: "test",
        systemPrompt: "You are a test agent.",
        tools: ["aider_chat"]
    });

    // Run Engine
    await engine.run(ctx, "Fix the bug", { interactive: false });

    // Verify stats from Brain
    const result: any = await brainClient.callTool({
        name: "brain_get_stats",
        arguments: {}
    });

    const stats = JSON.parse(result.content[0].text);
    console.log("Brain Stats:", stats);

    // 1. Verify Orchestrator Read (at start)
    expect(stats["orchestrator"]).toBeDefined();
    expect(stats["orchestrator"].queries).toBeGreaterThan(0);

    // 2. Verify Agent Write (after aider_chat)
    // The engine logic sets agentId = lastToolName ("aider_chat")
    expect(stats["aider_chat"]).toBeDefined();
    expect(stats["aider_chat"].writes).toBeGreaterThan(0);
  }, 30000); // Increase timeout for spawn
});
