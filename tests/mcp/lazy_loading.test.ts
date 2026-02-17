import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCP } from "../../src/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Mock the SDK modules
vi.mock("@modelcontextprotocol/sdk/client/index.js");
vi.mock("@modelcontextprotocol/sdk/client/stdio.js");

describe("MCP Lazy Loading", () => {
    let mcp: MCP;

    beforeEach(() => {
        vi.resetAllMocks();
        mcp = new MCP();

        // Mock Client constructor and methods
        (Client as any).mockImplementation(() => ({
            connect: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn().mockResolvedValue({ tools: [{ name: "mock_tool", description: "mock" }] }),
            callTool: vi.fn().mockResolvedValue({ content: [{ text: "success" }] })
        }));

        // Mock StdioClientTransport
        (StdioClientTransport as any).mockImplementation(() => ({
            // methods...
        }));
    });

    it("should initialize without connecting to servers", async () => {
        await mcp.init();
        // Client constructor should NOT have been called
        expect(Client).not.toHaveBeenCalled();
        expect(StdioClientTransport).not.toHaveBeenCalled();
    });

    it("should list discovered servers", async () => {
        await mcp.init();
        const servers = mcp.listServers();
        // We expect some servers to be found in src/mcp_servers/ (e.g. aider-server)
        expect(servers.length).toBeGreaterThan(0);
        const server = servers.find(s => s.name === "aider-server");
        expect(server).toBeDefined();
        expect(server?.status).toBe("stopped");
    });

    it("should provide management tools initially", async () => {
        await mcp.init();
        const tools = await mcp.getTools();
        expect(tools.find(t => t.name === "mcp_list_servers")).toBeDefined();
        expect(tools.find(t => t.name === "mcp_start_server")).toBeDefined();
        // Should NOT have mock_tool yet
        expect(tools.find(t => t.name === "mock_tool")).toBeUndefined();
    });

    it("should start a server and expose its tools", async () => {
        await mcp.init();
        const res = await mcp.startServer("aider-server");
        expect(res).toContain("Successfully started");

        expect(Client).toHaveBeenCalledTimes(1);
        expect(StdioClientTransport).toHaveBeenCalledTimes(1);

        const servers = mcp.listServers();
        const server = servers.find(s => s.name === "aider-server");
        expect(server?.status).toBe("running");

        const tools = await mcp.getTools();
        expect(tools.find(t => t.name === "mock_tool")).toBeDefined();
    });

    it("should handle startServer for unknown server", async () => {
        await mcp.init();
        await expect(mcp.startServer("unknown_server")).rejects.toThrow("not found");
    });
});
