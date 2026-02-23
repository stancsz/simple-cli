import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { MockMCP, MockMcpServer, mockToolHandlers, resetMocks } from "./test_helpers/mock_mcp_server.js";

// Mock MCP Infrastructure
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

describe("Secret Manager Integration Test", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();

        // Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "secret-manager-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create .env.agent
        await writeFile(join(testRoot, ".env.agent"), "API_KEY=secret_value\nDB_PASS=12345");
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it("should load secrets from .env.agent and provide get_secret tool", async () => {
        // Dynamic import to trigger top-level execution with mocked cwd
        await import("../../src/mcp_servers/secret_manager/index.js");

        const mcp = new MockMCP();
        // The server registers itself to mockToolHandlers
        // We can access tools via client
        const client = mcp.getClient("secret_manager");

        // Test get_secret
        const result = await client.callTool({
            name: "get_secret",
            arguments: { key: "API_KEY" }
        });

        expect(result.content[0].text).toBe("secret_value");

        // Test missing secret
        const resultMissing = await client.callTool({
            name: "get_secret",
            arguments: { key: "MISSING" }
        });
        expect(resultMissing.content[0].text).toContain("not found");
        expect(resultMissing.isError).toBe(true);
    });

    it("should allow runtime injection of secrets via inject_secret", async () => {
        await import("../../src/mcp_servers/secret_manager/index.js");
        const mcp = new MockMCP();
        const client = mcp.getClient("secret_manager");

        await client.callTool({
            name: "inject_secret",
            arguments: { key: "RUNTIME_KEY", value: "runtime_value" }
        });

        const result = await client.callTool({
            name: "get_secret",
            arguments: { key: "RUNTIME_KEY" }
        });

        expect(result.content[0].text).toBe("runtime_value");
    });
});
