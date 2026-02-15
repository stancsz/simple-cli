import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransformerLabServer } from "../../src/mcp_servers/transformer_lab/index.js";

global.fetch = vi.fn();

describe("TransformerLabServer", () => {
  let server: TransformerLabServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new TransformerLabServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle tl_list_models", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ([]),
    });
    const result = await callTool("tl_list_models", {});
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/models"),
        expect.anything()
    );
  });
});
