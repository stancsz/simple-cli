import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimAiServer } from "../../src/mcp_servers/sim_ai/index.js";

global.fetch = vi.fn();

describe("SimAiServer", () => {
  let server: SimAiServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new SimAiServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle sim_list_agents", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ([]),
    });
    const result = await callTool("sim_list_agents", {});
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/agents"),
        expect.anything()
    );
  });
});
