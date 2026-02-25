import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "path";

// Hoist mocks and shared state
const mocks = vi.hoisted(() => ({
    generate: vi.fn(),
    embed: vi.fn().mockResolvedValue([]),
    store: vi.fn(),
    syncDeal: vi.fn(),
    logNote: vi.fn(),
    getHubSpotClient: vi.fn(),
    vfs: {} as Record<string, string>,
    vdirs: new Set<string>()
}));

// Mock LLM
vi.mock("../../src/llm.js", () => ({
    createLLM: () => ({
        generate: mocks.generate,
        embed: mocks.embed
    })
}));

// Mock EpisodicMemory
vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: class {
        store = mocks.store;
    }
}));

// Mock CRM
vi.mock("../../src/mcp_servers/business_ops/crm.js", () => ({
    syncDealToHubSpot: mocks.syncDeal,
    logNoteToHubSpot: mocks.logNote,
    getHubSpotClient: mocks.getHubSpotClient
}));

// Mock FS
vi.mock("fs/promises", () => ({
    readFile: vi.fn().mockImplementation(async (path) => {
        if (mocks.vfs[path]) return mocks.vfs[path];
        throw new Error(`File not found: ${path}`);
    }),
    writeFile: vi.fn().mockImplementation(async (path, content) => {
        mocks.vfs[path] = content;
    }),
    mkdir: vi.fn().mockImplementation(async (path, opts) => {
        mocks.vdirs.add(path);
    }),
    rename: vi.fn().mockImplementation(async (oldPath, newPath) => {
        const keys = Object.keys(mocks.vfs);
        for (const key of keys) {
            if (key.startsWith(oldPath)) {
                const newKey = key.replace(oldPath, newPath);
                mocks.vfs[newKey] = mocks.vfs[key];
                delete mocks.vfs[key];
            }
        }
        mocks.vdirs.add(newPath);
    }),
    rm: vi.fn().mockImplementation(async (path) => {
        const keys = Object.keys(mocks.vfs);
        for (const key of keys) {
            if (key.startsWith(path)) delete mocks.vfs[key];
        }
    }),
    readdir: vi.fn().mockImplementation(async (path) => {
        const files = new Set();
        for (const key of Object.keys(mocks.vfs)) {
            if (key.startsWith(path)) {
                const rel = key.substring(path.length);
                const cleanRel = rel.startsWith('/') || rel.startsWith('\\') ? rel.substring(1) : rel;
                if (!cleanRel) continue;

                const parts = cleanRel.split(/[/\\]/);
                if (parts.length > 0 && parts[0]) {
                    files.add(parts[0]);
                }
            }
        }
        return Array.from(files);
    })
}));

vi.mock("fs", () => ({
    existsSync: vi.fn().mockImplementation((path) => {
        if (mocks.vfs[path]) return true;
        if (mocks.vdirs.has(path)) return true;
        for (const key of Object.keys(mocks.vfs)) {
            if (key.startsWith(path)) return true;
        }
        return false;
    })
}));

// Import tools AFTER mocks setup
import { registerOffboardingTools } from "../../src/mcp_servers/business_ops/tools/offboarding.js";

describe("Offboarding Automation", () => {
    let server: McpServer;
    let tools: Record<string, any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset VFS
        for (const key in mocks.vfs) delete mocks.vfs[key];
        mocks.vdirs.clear();

        // Setup MCP Server
        server = new McpServer({ name: "test_ops", version: "1.0.0" });

        // Capture tools
        // @ts-ignore
        server.tool = (name, desc, schema, handler) => {
            tools[name] = handler;
        };

        registerOffboardingTools(server);
    });

    it("should execute the full offboarding workflow", async () => {
        const clientId = "client-test";
        const cwd = process.cwd();

        // Setup initial state in VFS
        const companyDir = join(cwd, ".agent", "companies", clientId);
        const docsDir = join(companyDir, "docs");
        mocks.vdirs.add(companyDir);
        mocks.vdirs.add(docsDir);
        mocks.vfs[join(docsDir, "readme.md")] = "# Project Readme";

        // Mock LLM Response
        mocks.generate.mockResolvedValue({
            message: "# Handover Document\n\nSuccess."
        });

        // Mock CRM Response
        mocks.syncDeal.mockResolvedValue({ id: "deal_123", action: "updated" });

        // Execute Workflow
        const result = await tools["offboarding_workflow"]({ clientId });

        // Assertions
        const content = JSON.parse(result.content[0].text);
        if (content.status !== "success") {
            console.error(content.errors);
            console.log(content.logs);
        }
        expect(content.status).toBe("success");

        // 1. Check CRM update
        expect(mocks.syncDeal).toHaveBeenCalledWith(expect.objectContaining({
            dealstage: "closedwon"
        }));

        // 2. Check Archive
        const archiveDir = join(cwd, ".agent", "archives", clientId);
        const contextArchiveDir = join(archiveDir, "context");
        const handoverPath = join(archiveDir, "HANDOVER.md");

        // Verify file was moved (in VFS)
        const oldFile = join(docsDir, "readme.md");
        const newFile = join(contextArchiveDir, "docs", "readme.md");

        expect(mocks.vfs[oldFile]).toBeUndefined();
        expect(mocks.vfs[newFile]).toBe("# Project Readme");

        // 3. Check Handover Generation
        expect(mocks.generate).toHaveBeenCalled();
        expect(mocks.vfs[handoverPath]).toContain("# Handover");

        // 4. Check Episodic Log
        expect(mocks.store).toHaveBeenCalledWith(
            `offboarding-${clientId}`,
            expect.stringContaining("Complete Offboarding"),
            expect.any(String),
            expect.any(Array),
            clientId
        );
    });
});
