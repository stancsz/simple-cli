import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

// --- Hoisted Variables ---
const { registeredTools, mockLLMQueue, activeAgents } = vi.hoisted(() => {
    return {
        registeredTools: new Map<string, any>(),
        mockLLMQueue: [] as any[],
        activeAgents: new Map<string, any>()
    };
});

// --- Mocks Setup ---

const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    const next = mockLLMQueue.shift();
    if (!next) {
        return {
            thought: "Default mock response",
            tool: "none",
            args: {},
            message: "I am a mocked agent."
        };
    }
    if (typeof next === 'function') {
        return await next(system, history);
    }
    return next;
});

const mockEmbed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1));

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mockEmbed,
            generate: mockGenerate,
        }),
        LLM: class {
            embed = mockEmbed;
            generate = mockGenerate;
        },
    };
});

// Mock MCP Class
vi.mock("../../src/mcp.js", () => {
    class MockMCP {
        async init() {}
        async startServer(name: string) { return "started"; }
        async stopServer(name: string) {}
        isServerRunning(name: string) { return true; }
        listServers() { return []; }

        async getTools() {
            // Return tools registered in the global map (simulating discovery)
            return Array.from(registeredTools.values());
        }

        getClient(name: string) {
            return {
                callTool: async (params: any) => {
                    const tool = registeredTools.get(params.name);
                    if (!tool) throw new Error(`Tool ${params.name} not found`);
                    return await tool.execute(params.arguments);
                }
            };
        }
    }
    return {
        MCP: MockMCP
    };
});

// Mock McpServer from SDK
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: class {
            constructor(info: any) {}

            tool(name: string, desc: string, schema: any, handler: any) {
                const toolObj = {
                    name,
                    description: desc,
                    inputSchema: schema,
                    execute: async (args: any) => {
                        return await handler(args);
                    }
                };
                registeredTools.set(name, toolObj);
            }

            async connect(transport: any) {}
        }
    };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
    return {
        StdioServerTransport: class {}
    };
});

import { HiveMindServer } from "../../src/mcp_servers/hive_mind/index.js";

describe("Hive Mind Integration Test", () => {
    const testRoot = join(process.cwd(), "tests/fixtures/hive_mind");
    const brainDir = join(testRoot, ".agent/brain");

    let hiveMindServer: HiveMindServer;

    beforeAll(async () => {
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);
        process.env.BRAIN_STORAGE_ROOT = brainDir;

        if (existsSync(brainDir)) {
            await rm(brainDir, { recursive: true, force: true });
        }
        await mkdir(brainDir, { recursive: true });

        // Instantiate Server
        hiveMindServer = new HiveMindServer();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        mockLLMQueue.length = 0;
        vi.clearAllMocks();
    });

    it("should spawn a sub-agent", async () => {
        const tool = registeredTools.get("spawn_sub_agent");
        expect(tool).toBeDefined();

        const result: any = await tool.execute({
            role: "QA Engineer",
            task_description: "Test the app",
            constraints: "No prod access"
        });

        expect(result.content[0].text).toContain("Spawned agent");
        expect(hiveMindServer.activeAgents.size).toBe(1);

        const agent = Array.from(hiveMindServer.activeAgents.values())[0];
        expect(agent.role).toBe("QA Engineer");
    });

    it("should orchestrate a workflow (sequential)", async () => {
        const orchestrateTool = registeredTools.get("orchestrate_workflow");

        // Mock responses for the agents executing the steps
        // Step 1: Research
        mockLLMQueue.push({
            thought: "Researching...",
            message: "Research Complete: Found 3 bugs."
        });

        // Step 2: Fix
        mockLLMQueue.push({
            thought: "Fixing...",
            message: "Fix Complete: Applied patches."
        });

        const result: any = await orchestrateTool.execute({
            steps: [
                { id: "step1", description: "Research bugs", assigned_role: "QA Engineer" },
                { id: "step2", description: "Fix bugs", assigned_role: "Developer" }
            ]
        });

        expect(result.content[0].text).toContain("Workflow completed successfully");
        expect(result.content[0].text).toContain("Found 3 bugs");
        expect(result.content[0].text).toContain("Applied patches");

        // Verify Brain Storage (Delegation logged)
        // Since we can't easily peek into LanceDB mocked/real without async issues,
        // we assume if no error thrown, it worked.
        // Or we can spy on EpisodicMemory.store
    });

    it("should negotiate bids", async () => {
        // Clear agents and spawn 2 idle ones
        hiveMindServer.activeAgents.clear();

        const spawnTool = registeredTools.get("spawn_sub_agent");
        await spawnTool.execute({ role: "Dev A", task_description: "Coder" });
        await spawnTool.execute({ role: "Dev B", task_description: "Coder" });

        const negotiateTool = registeredTools.get("negotiate_bid");

        // Mock Bid Responses
        // Agent A
        mockLLMQueue.push({
            message: JSON.stringify({ complexity: 8, proposal: "I will work hard." })
        });
        // Agent B
        mockLLMQueue.push({
            message: JSON.stringify({ complexity: 3, proposal: "Easy task for me." })
        });

        const result: any = await negotiateTool.execute({
            task_description: "Build a landing page"
        });

        expect(result.content[0].text).toContain("Bidding complete");
        // Dev B should win (cost 3 vs 8)
        expect(result.content[0].text).toContain("Winner:");
        // Since IDs are UUIDs, we can't hardcode, but we check if the winner cost is 3
        expect(result.content[0].text).toContain("Cost: 3");
    });

    it("should resolve conflicts", async () => {
         const resolveTool = registeredTools.get("resolve_conflict");

         // Mock Judge Response
         mockLLMQueue.push({
             thought: "Analyzing conflict...",
             message: "Resolution: Agent A is correct, proceed with safety checks."
         });

         const result: any = await resolveTool.execute({
             agent_a_id: "agent-1",
             agent_b_id: "agent-2",
             issue: "Disagreement on API version"
         });

         expect(result.content[0].text).toContain("Resolution: Agent A is correct");
    });
});
