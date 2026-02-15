import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoolifyServer } from "../../src/mcp_servers/coolify/index.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("CoolifyServer", () => {
  let server: CoolifyServer;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.COOLIFY_API_URL = "http://coolify.test";
    process.env.COOLIFY_API_KEY = "test-token";
    server = new CoolifyServer();
  });

  // Helper to access tool handler
  const callTool = async (name: string, args: any) => {
    const mcpServer = (server as any).server;
    const tool = (mcpServer as any)._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  };

  it("should handle coolify_list_services", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ name: "Service 1" }],
    });

    const result = await callTool("coolify_list_services", {});
    expect(mockFetch).toHaveBeenCalledWith(
      "http://coolify.test/api/v1/services",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
    expect((result as any).content[0].text).toContain("Service 1");
  });

  it("should handle coolify_deploy_service", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "deployed" }),
    });

    const result = await callTool("coolify_deploy_service", {
      uuid: "123",
      force: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://coolify.test/api/v1/deploy?uuid=123&force=true",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect((result as any).content[0].text).toContain("deployed");
  });
});
