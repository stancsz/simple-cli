
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { CoreUpdaterServer } from "../../src/mcp_servers/core_updater/index.js";

// Mock LLM
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
            generate: vi.fn().mockResolvedValue("Mock response"),
        }),
    };
});

// Capture tool handlers
const toolHandlers = new Map<string, Function>();

// Mock McpServer
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: class {
            constructor() {}
            tool(name: string, description: string, schema: any, handler: Function) {
                toolHandlers.set(name, handler);
            }
            async connect() {}
        }
    };
});

// Mock stdio
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

describe("Core Update Safety Protocol", () => {
    let testRoot: string;
    let updaterServer: CoreUpdaterServer;

    beforeAll(() => {
        process.env.MOCK_EMBEDDINGS = "true";
    });

    afterAll(() => {
        delete process.env.MOCK_EMBEDDINGS;
        vi.restoreAllMocks();
    });

    beforeEach(async () => {
        toolHandlers.clear();
        testRoot = await mkdtemp(join(tmpdir(), "core-update-test-"));

        // Mock process.cwd() just in case, though we pass rootDir
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Setup directory structure
        await mkdir(join(testRoot, "src"), { recursive: true });
        await mkdir(join(testRoot, ".agent"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });

        // Create a dummy src/engine.ts
        await writeFile(join(testRoot, "src", "engine.ts"), "export const engine = 'v1';");

        // Create default config (no yolo)
        await writeFile(join(testRoot, ".agent", "config.json"), JSON.stringify({
            yoloMode: false
        }));

        // Instantiate server
        updaterServer = new CoreUpdaterServer(testRoot);
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    async function callTool(name: string, args: any) {
        const handler = toolHandlers.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return await handler(args);
    }

    it("should propose a change and verify proposal creation", async () => {
        const res = await callTool("propose_core_update", {
            title: "Update Engine",
            description: "Upgrade engine to v2",
            changes: [
                {
                    filepath: "src/engine.ts",
                    newContent: "export const engine = 'v2';"
                }
            ]
        });

        expect(res.content[0].text).toContain("Proposal Created");
        expect(res.content[0].text).toContain("Risk Level: critical"); // engine.ts is critical

        // Verify file created
        // We can't easily check the ID without parsing the response,
        // but we can check the storage dir.
        // CoreProposalStorage uses `.agent/core_updates`?
        // Let's check `src/mcp_servers/core_updater/storage.ts` logic via file system check.
        // But better, let's extract the ID from the response.
        const idMatch = res.content[0].text.match(/ID: ([a-f0-9-]+)/);
        expect(idMatch).toBeTruthy();
    });

    it("should reject critical update without approval token", async () => {
        // 1. Propose
        const proposeRes = await callTool("propose_core_update", {
            title: "Critical Update",
            description: "Break everything",
            changes: [{ filepath: "src/engine.ts", newContent: "broken" }]
        });
        const idMatch = proposeRes.content[0].text.match(/ID: ([a-f0-9-]+)/);
        const id = idMatch![1];

        // 2. Apply with WRONG token
        const applyRes = await callTool("apply_core_update", {
            update_id: id,
            approval_token: "wrong-token"
        });

        expect(applyRes.isError).toBe(true);
        expect(applyRes.content[0].text).toContain("Update Rejected");
    });

    it("should allow low-risk update in YOLO mode without token", async () => {
        // 1. Enable YOLO
        await writeFile(join(testRoot, ".agent", "config.json"), JSON.stringify({
            yoloMode: true
        }));

        // 2. Propose low-risk change
        await writeFile(join(testRoot, "src", "utils.ts"), "old"); // Create non-critical file

        const proposeRes = await callTool("propose_core_update", {
            title: "Low Risk Update",
            description: "Fix utils",
            changes: [{ filepath: "src/utils.ts", newContent: "new" }]
        });

        expect(proposeRes.content[0].text).toContain("Risk Level: low");
        const id = proposeRes.content[0].text.match(/ID: ([a-f0-9-]+)/)![1];

        // 3. Apply with WRONG token (should succeed due to YOLO + Low Risk)
        const applyRes = await callTool("apply_core_update", {
            update_id: id,
            approval_token: "ignored-token"
        });

        expect(applyRes.content[0].text).toContain("Update Applied Successfully");
        expect(applyRes.isError).toBeFalsy();
    });

    it("should reject critical update even in YOLO mode if token is missing", async () => {
         // 1. Enable YOLO
         await writeFile(join(testRoot, ".agent", "config.json"), JSON.stringify({
            yoloMode: true
        }));

        // 2. Propose CRITICAL change
        const proposeRes = await callTool("propose_core_update", {
            title: "Critical YOLO Update",
            description: "Update engine",
            changes: [{ filepath: "src/engine.ts", newContent: "v3" }]
        });

        expect(proposeRes.content[0].text).toContain("Risk Level: critical");
        const id = proposeRes.content[0].text.match(/ID: ([a-f0-9-]+)/)![1];

        // 3. Apply without correct token
        const applyRes = await callTool("apply_core_update", {
            update_id: id,
            approval_token: "wrong"
        });

        expect(applyRes.isError).toBe(true);
        expect(applyRes.content[0].text).toContain("Update Rejected");
        expect(applyRes.content[0].text).toContain("requires token");
    });

    it("should successfully apply update with valid token and create backup", async () => {
        // 1. Propose
        const proposeRes = await callTool("propose_core_update", {
            title: "Valid Update",
            description: "Update engine",
            changes: [{ filepath: "src/engine.ts", newContent: "export const engine = 'v2';" }]
        });
        const id = proposeRes.content[0].text.match(/ID: ([a-f0-9-]+)/)![1];
        const token = proposeRes.content[0].text.match(/Approval Token: ([a-f0-9-]+)/)![1];

        // 2. Apply
        const applyRes = await callTool("apply_core_update", {
            update_id: id,
            approval_token: token
        });

        expect(applyRes.content[0].text).toContain("Update Applied Successfully");
        const backupId = applyRes.content[0].text.match(/Backup ID: ([a-f0-9-]+)/)![1];

        // 3. Verify File Changed
        const content = await readFile(join(testRoot, "src", "engine.ts"), "utf-8");
        expect(content).toBe("export const engine = 'v2';");

        // 4. Verify Backup
        const backupPath = join(testRoot, ".agent", "backups", backupId, "src_engine.ts");
        expect(existsSync(backupPath)).toBe(true);
        const backupContent = await readFile(backupPath, "utf-8");
        expect(backupContent).toBe("export const engine = 'v1';");
    });
});
