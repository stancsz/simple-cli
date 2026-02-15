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

  it("should handle coolify_list_services", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ name: "Service 1" }],
    });

    // Access private property to test tool handler directly
    const tool = (server as any).server._registeredTools["coolify_list_services"];
    const result = await tool.handler({});

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

    // Access private property to test tool handler directly
    const tool = (server as any).server._registeredTools["coolify_deploy_service"];
    const result = await tool.handler({
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
