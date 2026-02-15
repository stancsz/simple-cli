import { describe, it, expect, vi, beforeEach } from "vitest";
import { DokployServer } from "../../src/mcp_servers/dokploy/index.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("DokployServer", () => {
  let server: DokployServer;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DOKPLOY_API_URL = "http://dokploy.test";
    process.env.DOKPLOY_API_KEY = "test-key";
    server = new DokployServer();
  });

  it("should handle dokploy_list_projects", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ name: "Project 1" }],
    });

    const result = await (server as any).server._registeredTools[
      "dokploy_list_projects"
    ].handler({});
    expect(mockFetch).toHaveBeenCalledWith(
      "http://dokploy.test/api/project.all",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
    expect((result as any).content[0].text).toContain("Project 1");
  });

  it("should handle dokploy_create_project", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", name: "New Project" }),
    });

    const result = await (server as any).server._registeredTools[
      "dokploy_create_project"
    ].handler({
      name: "New Project",
      description: "Desc",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://dokploy.test/api/project.create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Project", description: "Desc" }),
      }),
    );
    expect((result as any).content[0].text).toContain("New Project");
  });
});
