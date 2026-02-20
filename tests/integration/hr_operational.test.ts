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
    // If it's a raw object (LLMResponse structure), return it
    if (next.message || next.tool) return next;
    // If it's just a string, wrap it
    return {
        thought: "Mock thought",
        tool: "none",
        args: {},
        message: JSON.stringify(next)
    };
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

import { HRServer } from "../../src/mcp_servers/hr/index.js";

describe("HR Operational Integration Test", () => {
    let testRoot: string;
    let hrServer: HRServer;
    let cwdSpy: any;

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
        testRoot = await mkdtemp(join(tmpdir(), "hr-test-"));
        cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "hr", "proposals"), { recursive: true });
        await mkdir(join(testRoot, "logs"), { recursive: true });

        // 2. Initialize Server
        hrServer = new HRServer();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        if (cwdSpy) cwdSpy.mockRestore();
    });

    it("should analyze logs and generate a proposal", async () => {
        const mcp = new MockMCP();
        // Register HR tools (simulating connection)
        // Since HRServer constructor runs and registers tools to MockMcpServer which fills mockToolHandlers
        // We can just use MockMCP to get a client which uses mockToolHandlers

        const client = mcp.getClient("hr_loop");

        // 1. Seed Logs
        const logContent = [
            { timestamp: "2023-10-27T10:00:00Z", sop: "deploy", result: { success: false, logs: [{ step: "build", status: "failed", output: "Error: Out of memory" }] } },
            { timestamp: "2023-10-27T10:05:00Z", sop: "deploy", result: { success: false, logs: [{ step: "build", status: "failed", output: "Error: Out of memory" }] } }
        ];
        await writeFile(join(testRoot, ".agent", "brain", "sop_logs.json"), JSON.stringify(logContent));

        // 2. Queue LLM Response
        mockLLMQueue.push({
            thought: "Analyzing logs...",
            message: JSON.stringify({
                analysis: "Repeated OOM errors during build.",
                improvement_needed: true,
                title: "Increase Build Memory",
                description: "The build process is running out of memory.",
                affected_files: ["config/build.json"],
                patch: '{ "memory": "4GB" }'
            })
        });

        // 3. Call analyze_logs
        // Arguments: { limit: 10 }
        const res = await client.callTool({
            name: "analyze_logs",
            arguments: { limit: 10 }
        });

        // 4. Verify Output
        expect(res.content[0].text).toContain("Proposal Created");

        // 5. Verify Proposal File
        const proposalsDir = join(testRoot, ".agent", "hr", "proposals");
        const files = await readdir(proposalsDir);
        expect(files.length).toBe(1);

        const proposalContent = JSON.parse(await readFile(join(proposalsDir, files[0]), "utf-8"));
        expect(proposalContent.title).toBe("Increase Build Memory");
        expect(proposalContent.status).toBe("pending");
    });

    it("should handle logs/ directory files", async () => {
        const mcp = new MockMCP();
        const client = mcp.getClient("hr_loop");

        // 1. Seed General Logs
        await writeFile(join(testRoot, "logs", "app.log"), "Error: Connection timeout\nError: Connection timeout");

        // 2. Queue LLM Response
        mockLLMQueue.push({
             thought: "Analyzing general logs...",
             message: JSON.stringify({
                 analysis: "Connection timeouts detected.",
                 improvement_needed: true,
                 title: "Fix Timeouts",
                 description: "Increase timeout settings.",
                 affected_files: ["config/network.json"],
                 patch: '{ "timeout": 5000 }'
             })
        });

        // 3. Call analyze_logs
        await client.callTool({
            name: "analyze_logs",
            arguments: { limit: 10 }
        });

        // 4. Verify Proposal File
        const proposalsDir = join(testRoot, ".agent", "hr", "proposals");
        const files = await readdir(proposalsDir);
        expect(files.length).toBe(1);

        const proposalContent = JSON.parse(await readFile(join(proposalsDir, files[0]), "utf-8"));
        expect(proposalContent.title).toBe("Fix Timeouts");
    });
});
