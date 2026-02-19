import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdir, rm, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { TaskDefinition } from "../../src/daemon/task_definitions.js";

// --- Hoisted Variables ---
const { registeredTools, mockLLMQueue } = vi.hoisted(() => {
    return {
        registeredTools: new Map<string, any>(),
        mockLLMQueue: [] as any[]
    };
});

// --- Mocks Setup ---
const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    const next = mockLLMQueue.shift();
    if (!next) {
        return {
            thought: "No mock response queued.",
            tool: "none",
            args: {},
            message: "End of script."
        };
    }
    if (typeof next === 'function') {
        return await next(system, history);
    }
    // If next is a string (like a JSON proposal), return it as message
    if (next.message && typeof next.message === 'string' && next.message.startsWith('{')) {
         return next;
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

vi.mock("../../src/mcp.js", () => {
    class MockMCP {
        async init() {}
        async startServer(name: string) { return "started"; }
        async stopServer(name: string) {}
        isServerRunning(name: string) { return true; }
        listServers() { return [{ name: "brain", status: "running" }]; }

        async getTools() {
            return Array.from(registeredTools.values());
        }

        getClient(name: string) {
            return {
                callTool: async (params: any) => {
                    const tool = registeredTools.get(params.name);
                    if (!tool) throw new Error(`Tool ${params.name} not found`);
                    try {
                         return await tool.execute(params.arguments);
                    } catch (e: any) {
                        throw e;
                    }
                }
            };
        }
    }
    return {
        MCP: MockMCP
    };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: class {
            _tools = new Map();
            constructor(info: any) {}

            tool(name: string, desc: string, schema: any, handler: any) {
                const toolObj = {
                    name,
                    description: desc,
                    inputSchema: schema,
                    execute: async (args: any) => {
                        const res = await handler(args);
                        return res;
                    }
                };
                registeredTools.set(name, toolObj);
                this._tools.set(name, toolObj);
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

// Import Real Classes (after mocks)
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { HRServer } from "../../src/mcp_servers/hr/index.js";
import { BrainServer } from "../../src/mcp_servers/brain.js";
import { Scheduler } from "../../src/scheduler.js";

// Mock handleTaskTrigger
vi.mock("../../src/scheduler/trigger.js", () => {
    return {
        handleTaskTrigger: async (task: TaskDefinition) => {
            // We interpret the task here to run the SOP logic IN-PROCESS
            if (task.name === "website_deployment") {
               const sopTool = registeredTools.get("sop_execute");
               if (!sopTool) throw new Error("sop_execute tool not found");

               const input = "Deploy website for client_a";
               await sopTool.execute({ name: "website_deployment", input });
            }
            return { exitCode: 0 };
        },
        killAllChildren: () => {}
    };
});

describe("Four Pillars End-to-End Integration", () => {
    const testRoot = join(process.cwd(), "tests/fixtures/four_pillars");
    const brainDir = join(testRoot, ".agent/brain");
    const companiesDir = join(testRoot, ".agent/companies");
    const sopsDir = join(testRoot, "docs/sops");
    const sopLogsPath = join(brainDir, "sop_logs.json");

    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;
    let scheduler: Scheduler;

    beforeAll(async () => {
        const realCwd = process.cwd();
        // Setup Filesystem
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);
        process.env.BRAIN_STORAGE_ROOT = brainDir;
        process.env.JULES_COMPANY = "client_a"; // Default context

        // Clean
        await rm(testRoot, { recursive: true, force: true });
        await mkdir(testRoot, { recursive: true });
        await mkdir(brainDir, { recursive: true });
        await mkdir(sopsDir, { recursive: true });
        await mkdir(join(companiesDir, "client_a/docs"), { recursive: true });

        // Create Fixtures
        // 1. Company Context (from fixture)
        const contextJson = await readFile(join(realCwd, "tests/fixtures/company_context_client_a.json"), "utf-8");
        const context = JSON.parse(contextJson);
        const mdContent = `# ${context.name}\nPersona: ${context.persona.tone}\nBrand Voice: ${context.brand_voice}`;
        await writeFile(join(companiesDir, "client_a/docs/context.md"), mdContent);

        // 2. SOP (from fixture)
        const sopContent = await readFile(join(realCwd, "tests/fixtures/sop_website_deployment.md"), "utf-8");
        await writeFile(join(sopsDir, "website_deployment.md"), sopContent);

        // Initialize Servers
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();

        // Register extra mock tools needed for SOP
        registeredTools.set("write_file", {
            name: "write_file",
            description: "Write file",
            inputSchema: {},
            execute: async ({ content, filepath }: any) => {
                await writeFile(join(testRoot, filepath), content);
                return { content: [{ type: "text", text: "File written" }] };
            }
        });
        registeredTools.set("ls", {
            name: "ls",
            description: "List files",
            inputSchema: {},
            execute: async () => ({ content: [{ type: "text", text: "index.html" }] })
        });

        scheduler = new Scheduler(testRoot);
    });

    afterAll(async () => {
        await scheduler.stop();
        vi.restoreAllMocks();
        // Cleanup artifacts
        await rm(testRoot, { recursive: true, force: true });
    });

    it("should execute the 4-Pillar Vision flow", async () => {
        // --- 1. Load Company Context ---
        const loadContextTool = registeredTools.get("load_company_context");
        expect(loadContextTool).toBeDefined();
        const loadResult: any = await loadContextTool.execute({ company_id: "client_a" });
        expect(loadResult.content[0].text).toContain("Successfully ingested");

        // --- 2. Ghost Mode Execution (Scheduler -> JobDelegator -> SOP) ---
        // Prepare LLM responses for SOP Executor
        // Step 1
        mockLLMQueue.push({
             thought: "Step 1: Create file",
             tool: "write_file",
             args: { filepath: "index.html", content: "<h1>Hello</h1>" },
             message: "Creating file..."
        });
        mockLLMQueue.push({
             thought: "File created.",
             tool: "complete_step",
             args: { summary: "Created index.html" },
             message: "Done step 1"
        });
        // Step 2
        mockLLMQueue.push({
             thought: "Step 2: Verify",
             tool: "ls",
             args: {},
             message: "Listing..."
        });
        mockLLMQueue.push({
             thought: "Verified.",
             tool: "complete_step",
             args: { summary: "Verified index.html exists" },
             message: "Done step 2"
        });

        const taskDef: TaskDefinition = {
            id: "ghost-task-1",
            name: "website_deployment",
            company: "client_a",
            prompt: "Deploy website",
            trigger: "cron",
            schedule: "0 0 * * *"
        };

        // Trigger Scheduler Manually
        await (scheduler as any).runTask(taskDef);

        // Verify Artifacts
        expect(existsSync(join(testRoot, "index.html"))).toBe(true);
        expect(await readFile(join(testRoot, "index.html"), "utf-8")).toBe("<h1>Hello</h1>");

        // Verify Brain Logs
        // JobDelegator uses 'log_experience'.
        // We can use the 'recall_delegation_patterns' tool to verify.
        const recallTool = registeredTools.get("recall_delegation_patterns");
        expect(recallTool).toBeDefined();

        const recallRes: any = await recallTool.execute({ task_type: "website_deployment", company: "client_a" });
        expect(recallRes.content[0].text).toContain("Found 1 relevant experiences");

        // --- 3. HR Loop (Weekly Review) ---
        // Prepare LLM response for HR analysis
        mockLLMQueue.push({
            thought: "Analyzing logs...",
            message: JSON.stringify({
                improvement_needed: true,
                title: "Optimize Deployment",
                analysis: "Deployment is slow.",
                description: "Add caching to deployment.",
                affected_files: [],
                patch: ""
            })
        });

        const reviewTool = registeredTools.get("perform_weekly_review");
        const reviewResult: any = await reviewTool.execute({});

        expect(reviewResult.content[0].text).toContain("Proposal Created");
    });
});
