
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const { mockLLMQueue } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[]
    };
});

// --- Mock Setup ---
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
    if (next.message || next.tool) return next;
    return {
        thought: "Mock thought",
        tool: "none",
        args: {},
        message: JSON.stringify(next)
    };
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    // Generate distinct embedding based on content hash/length to verify isolation
    const val = (text.includes("Acme") ? 0.1 : 0.9);
    return new Array(1536).fill(val);
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

// Mock MCP Infrastructure
import { MockMCP, MockMcpServer, resetMocks, mockServerTools, mockToolHandlers } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({
    MCP: MockMCP
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// Import Real Servers
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { HRServer } from "../../src/mcp_servers/hr/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { HealthMonitorServer } from "../../src/mcp_servers/health_monitor/index.js";

describe("Multi-Tenant 4-Pillars Integration Test", () => {
    let testRoot: string;
    let cwdSpy: any;

    // Servers
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;
    let healthServer: HealthMonitorServer;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "multi-tenant-test-"));
        cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(testRoot, "logs"), { recursive: true });

        // 2. Initialize Servers
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();
        healthServer = new HealthMonitorServer();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        if (cwdSpy) cwdSpy.mockRestore();
    });

    it("should strictly isolate artifacts, memories, and proposals between companies", async () => {
        const mcp = new MockMCP();
        const companyClient = mcp.getClient("company_context");
        const sopClient = mcp.getClient("sop_engine");
        const hrClient = mcp.getClient("hr_loop");
        const brainClient = mcp.getClient("brain");
        const healthClient = mcp.getClient("health_monitor");

        // ==========================================
        // Scenario 1: Context Setup & Isolation
        // ==========================================
        console.log("--- Scenario 1: Context Isolation ---");

        // Setup Acme
        const acmeDir = join(testRoot, ".agent", "companies", "acme", "docs");
        await mkdir(acmeDir, { recursive: true });
        await writeFile(join(acmeDir, "policy.md"), "Acme Policy: Speed over safety.");

        // Setup Beta
        const betaDir = join(testRoot, ".agent", "companies", "beta", "docs");
        await mkdir(betaDir, { recursive: true });
        await writeFile(join(betaDir, "policy.md"), "Beta Policy: Safety first.");

        // Load Context
        await companyClient.callTool({ name: "load_company_context", arguments: { company_id: "acme" } });
        await companyClient.callTool({ name: "load_company_context", arguments: { company_id: "beta" } });

        // Verify Isolation
        // We rely on mockEmbed returning different vectors for "Acme" vs "Beta" text
        // But since LanceDB is running in-process (mocked mostly?), wait, we are using real LanceDB on disk.
        // It relies on our mockEmbed function.
        const resAcme = await companyClient.callTool({
            name: "query_company_context",
            arguments: { query: "policy", company_id: "acme" }
        });
        expect(resAcme.content[0].text).toContain("Acme Policy");
        expect(resAcme.content[0].text).not.toContain("Beta Policy");

        const resBeta = await companyClient.callTool({
            name: "query_company_context",
            arguments: { query: "policy", company_id: "beta" }
        });
        expect(resBeta.content[0].text).toContain("Beta Policy");
        expect(resBeta.content[0].text).not.toContain("Acme Policy");


        // ==========================================
        // Scenario 2: SOP Execution (Interleaved)
        // ==========================================
        console.log("--- Scenario 2: SOP Execution ---");

        // Create SOP
        const sopContent = `# Title: Deploy\n1. Build\n2. Ship`;
        await writeFile(join(testRoot, "docs", "sops", "deploy.md"), sopContent);

        // Queue LLM for Acme Execution
        mockLLMQueue.push({
            thought: "Building for Acme...",
            tool: "complete_step",
            args: { summary: "Acme Build Done" }
        });
        mockLLMQueue.push({
            thought: "Shipping for Acme...",
            tool: "complete_step",
            args: { summary: "Acme Ship Done" }
        });

        // Execute for Acme
        await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "deploy", input: "prod", company: "acme" }
        });

        // Queue LLM for Beta Execution
        mockLLMQueue.push({
            thought: "Building for Beta...",
            tool: "complete_step",
            args: { summary: "Beta Build Done" }
        });
        mockLLMQueue.push({
            thought: "Shipping for Beta...",
            tool: "complete_step",
            args: { summary: "Beta Ship Done" }
        });

        // Execute for Beta
        await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "deploy", input: "staging", company: "beta" }
        });

        // Verify Log Isolation
        const acmeLogsPath = join(testRoot, ".agent", "companies", "acme", "brain", "sop_logs.json");
        const betaLogsPath = join(testRoot, ".agent", "companies", "beta", "brain", "sop_logs.json");

        expect(existsSync(acmeLogsPath)).toBe(true);
        expect(existsSync(betaLogsPath)).toBe(true);

        const acmeLogs = JSON.parse(await readFile(acmeLogsPath, "utf-8"));
        const betaLogs = JSON.parse(await readFile(betaLogsPath, "utf-8"));

        expect(acmeLogs.length).toBe(2); // 2 steps
        expect(betaLogs.length).toBe(2);

        // Verify Brain Memory Isolation
        const acmeMemories = await brainClient.callTool({
            name: "recall_delegation_patterns",
            arguments: { task_type: "sop_execution", company: "acme" }
        });
        expect(acmeMemories.content[0].text).toContain("Found 1 relevant experiences"); // 1 SOP run

        const betaMemories = await brainClient.callTool({
             name: "recall_delegation_patterns",
             arguments: { task_type: "sop_execution", company: "beta" }
        });
        expect(betaMemories.content[0].text).toContain("Found 1 relevant experiences");


        // ==========================================
        // Scenario 3: HR Loop (Isolated Analysis)
        // ==========================================
        console.log("--- Scenario 3: HR Loop ---");

        // Inject Failure for Acme ONLY
        const acmeFailLog = [{
            timestamp: new Date().toISOString(),
            sop: "deploy",
            result: { success: false, logs: [{ step: "build", status: "failed", output: "Acme Error" }] }
        }];
        await writeFile(acmeLogsPath, JSON.stringify(acmeFailLog));

        // Queue LLM for Acme HR
        mockLLMQueue.push({
            message: JSON.stringify({
                title: "Fix Acme Build",
                analysis: "Acme failed.",
                improvement_needed: true,
                affected_files: ["acme.config"],
                patch: "fix"
            })
        });

        // Run HR for Acme
        const hrResAcme = await hrClient.callTool({
            name: "analyze_logs",
            arguments: { limit: 5, company: "acme" }
        });
        expect(hrResAcme.content[0].text).toContain("Proposal Created");

        // Verify Proposal Location
        const acmeProposalDir = join(testRoot, ".agent", "companies", "acme", "hr", "proposals");
        const acmeProposals = await readdir(acmeProposalDir);
        expect(acmeProposals.length).toBe(1);

        // Run HR for Beta (Should find no errors as we didn't inject failure in beta logs)
        // Beta logs are still the success ones from Step 2
        // We need to queue an LLM response saying "No improvement needed"
        mockLLMQueue.push({
             message: JSON.stringify({
                 title: "Review Beta",
                 analysis: "All good.",
                 improvement_needed: false
             })
        });

        const hrResBeta = await hrClient.callTool({
            name: "analyze_logs",
            arguments: { limit: 5, company: "beta" }
        });
        expect(hrResBeta.content[0].text).toContain("No improvements suggested");

        // Verify Beta Proposal Dir is empty (or doesn't exist if lazy init)
        const betaProposalDir = join(testRoot, ".agent", "companies", "beta", "hr", "proposals");
        if (existsSync(betaProposalDir)) {
             const betaProposals = await readdir(betaProposalDir);
             expect(betaProposals.length).toBe(0);
        }

        // ==========================================
        // Scenario 4: Health Monitor (Tagged Metrics)
        // ==========================================
        console.log("--- Scenario 4: Health Monitor ---");

        await healthClient.callTool({
            name: "track_metric",
            arguments: { agent: "worker", metric: "latency", value: 100, tags: { company: "acme" } }
        });

        await healthClient.callTool({
            name: "track_metric",
            arguments: { agent: "worker", metric: "latency", value: 500, tags: { company: "beta" } }
        });

        // Query Acme Metrics
        const reportAcme = await healthClient.callTool({
            name: "get_health_report",
            arguments: { timeframe: "last_hour", tags: { company: "acme" } }
        });
        const acmeData = JSON.parse(reportAcme.content[0].text);
        expect(acmeData["worker:latency"].avg).toBe(100);

        // Query Beta Metrics
        const reportBeta = await healthClient.callTool({
            name: "get_health_report",
            arguments: { timeframe: "last_hour", tags: { company: "beta" } }
        });
        const betaData = JSON.parse(reportBeta.content[0].text);
        expect(betaData["worker:latency"].avg).toBe(500);

    });
});
