import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnythingLlmServer } from "../../src/mcp_servers/anything_llm/index.js";

// Mock global fetch
global.fetch = vi.fn();

describe("AnythingLlmServer", () => {
  let server: AnythingLlmServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new AnythingLlmServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle anything_list_workspaces", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ workspaces: [] }),
    });

    const result = await callTool("anything_list_workspaces", {});

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/workspaces"),
      expect.objectContaining({ method: "GET" })
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ workspaces: [] });
  });

  it("should handle anything_chat", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Hello" }),
    });

    const result = await callTool("anything_chat", {
      workspace_slug: "test-slug",
      message: "Hi",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/workspace/test-slug/chat"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Hi", mode: "chat" }),
      })
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ response: "Hello" });
  });
});
