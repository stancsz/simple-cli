
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const { mockLLMQueue, mockDB } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[],
        mockDB: new Map<string, any[]>()
    };
});

// --- Mock Setup ---

// 1. Mock LanceDB (Stateful In-Memory)
vi.mock("@lancedb/lancedb", () => {
    return {
        connect: vi.fn().mockResolvedValue({
            openTable: vi.fn().mockImplementation(async (name) => {
                if (!mockDB.has(name)) {
                    throw new Error(`Table '${name}' does not exist`);
                }
                return {
                    add: vi.fn().mockImplementation(async (rows) => {
                        const current = mockDB.get(name) || [];
                        mockDB.set(name, [...current, ...rows]);
                    }),
                    search: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            toArray: vi.fn().mockImplementation(async () => {
                                return mockDB.get(name) || [];
                            })
                        })
                    }),
                    countRows: vi.fn().mockResolvedValue((mockDB.get(name) || []).length)
                };
            }),
            createTable: vi.fn().mockImplementation(async (name, data) => {
                mockDB.set(name, data || []);
                return {
                    add: vi.fn().mockImplementation(async (rows) => {
                         const current = mockDB.get(name) || [];
                         mockDB.set(name, [...current, ...rows]);
                    }),
                    search: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            toArray: vi.fn().mockImplementation(async () => {
                                return mockDB.get(name) || [];
                            })
                        })
                    })
                };
            }),
            tableNames: vi.fn().mockResolvedValue(Array.from(mockDB.keys()))
        })
    };
});

// 2. Mock LLM (shared across all components)
let generateCallCount = 0;
const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    generateCallCount++;
    if (generateCallCount > 50) {
        throw new Error("Too many LLM calls - preventing OOM (Infinite loop detected)");
    }

    const next = mockLLMQueue.shift();
    if (next) {
        if (typeof next === 'function') {
            return await next(system, history);
        }
        return next;
    }

    // Default concurrent behavior
    // MATCH "SOP Title: Deploy"
    if (system.includes("Deploy") && !system.includes("ClientC")) {
            return {
                tool: "complete_step",
                args: { summary: "Step completed for ClientA" }
            };
    }
    // HR PROMPT MATCH
    if (system.includes("HR Loop") || system.includes("Recent Execution Logs")) {
        return {
            message: JSON.stringify({
                title: "Fix OOM",
                improvement_needed: true,
                analysis: "Out of memory detected.",
                affected_files: ["config.json"],
                patch: "memory: 2GB"
            })
        };
    }
    return {
        thought: "Default response",
        tool: "none",
        args: {},
        message: "Proceeding."
    };
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    // REDUCED VECTOR SIZE TO 10
    const val = text.length % 100 / 100;
    return new Array(10).fill(val);
});

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

// 3. Mock MCP Infrastructure
import { mockToolHandlers, mockServerTools, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({
    MCP: MockMCP
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// --- Imports (Real Classes) ---
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { HRServer } from "../../src/mcp_servers/hr/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";

describe("Multi-Company Stress Test (Phase 9.5)", () => {
    let testRoot: string;

    // Servers
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        mockDB.clear();
        generateCallCount = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "stress-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure for companies
        const companies = ["ClientA", "ClientB", "ClientC"];
        for (const company of companies) {
            await mkdir(join(testRoot, ".agent", "companies", company, "brain"), { recursive: true });
            await mkdir(join(testRoot, ".agent", "companies", company, "hr", "proposals"), { recursive: true });
            await mkdir(join(testRoot, ".agent", "companies", company, "logs"), { recursive: true });
            await mkdir(join(testRoot, ".agent", "companies", company, "docs"), { recursive: true });
            await mkdir(join(testRoot, ".agent", "companies", company, "config"), { recursive: true });
        }
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });

        // 2. Initialize Servers
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should handle concurrent multi-company workflows with strict isolation", async () => {
        const mcp = new MockMCP();
        const start = Date.now();

        // ==========================================
        // Setup: SOP and Initial Data
        // ==========================================

        await writeFile(join(testRoot, "docs", "sops", "deploy.md"), "# Title: Deploy\n1. Build\n2. Push");

        const clientCLogs = [
            {
                timestamp: new Date().toISOString(),
                sop: "deploy",
                step: 1,
                status: "failure",
                details: "Build failed: Out of memory"
            }
        ];
        await writeFile(join(testRoot, ".agent", "companies", "ClientC", "brain", "sop_logs.json"), JSON.stringify(clientCLogs));

        // ==========================================
        // Concurrent Operations
        // ==========================================
        console.log("--- Starting Concurrent Operations ---");

        const ops = [];

        // Operation A: ClientA executes SOP
        ops.push(mcp.getClient("sop_engine").callTool({
            name: "sop_execute",
            arguments: { name: "deploy", input: "Prod", company: "ClientA" }
        }).then(res => ({ client: "ClientA", res })));

        // Operation B: ClientB stores and queries Brain
        ops.push((async () => {
            const client = mcp.getClient("brain");
            await client.callTool({
                name: "brain_store",
                arguments: { taskId: "task-b", request: "req-b", solution: "sol-b", company: "ClientB" }
            });
            return { client: "ClientB", res: { content: [{ type: "text", text: "Brain Store Complete" }] } };
        })());

        // Operation C: ClientC runs HR Analysis
        ops.push(mcp.getClient("hr_loop").callTool({
            name: "analyze_logs",
            arguments: { company: "ClientC" }
        }).then(res => ({ client: "ClientC", res })));


        // Execute all
        const results = await Promise.all(ops);
        const end = Date.now();

        console.log(`Concurrent operations completed in ${end - start}ms`);

        // ==========================================
        // Verification & Isolation Checks
        // ==========================================

        // 1. Verify ClientA SOP Logs Isolation
        const logPathA = join(testRoot, ".agent", "companies", "ClientA", "brain", "sop_logs.json");
        expect(existsSync(logPathA)).toBe(true);
        const logsA = JSON.parse(await readFile(logPathA, "utf-8"));
        expect(logsA.length).toBeGreaterThan(0);
        expect(logsA[0].sop).toContain("Deploy");

        // Should NOT exist in ClientB folder
        const logPathB = join(testRoot, ".agent", "companies", "ClientB", "brain", "sop_logs.json");
        expect(existsSync(logPathB)).toBe(false);


        // 2. Verify ClientB Brain Isolation (via MockDB)
        const clientBTable = mockDB.get("episodic_memories_ClientB");
        expect(clientBTable).toBeDefined();
        expect(clientBTable?.length).toBe(1);
        expect(clientBTable?.[0].agentResponse).toBe("sol-b");

        // Check ClientA does not have ClientB's data in its table
        const clientATable = mockDB.get("episodic_memories_ClientA");
        if (clientATable) {
            const hasSolB = clientATable.some(row => row.agentResponse === "sol-b");
            expect(hasSolB).toBe(false);
        }

        // 3. Verify ClientC HR Proposal Isolation
        const resC = results.find(r => r.client === "ClientC")?.res;
        expect(resC.content[0].text).toContain("Proposal Created");

        const proposalDirC = join(testRoot, ".agent", "companies", "ClientC", "hr", "proposals");
        const { readdir } = await import("fs/promises");
        const proposalsC = await readdir(proposalDirC);
        expect(proposalsC.length).toBe(1);

        const proposalDirA = join(testRoot, ".agent", "companies", "ClientA", "hr", "proposals");
        const proposalsA = await readdir(proposalDirA);
        expect(proposalsA.length).toBe(0);

    });
});
