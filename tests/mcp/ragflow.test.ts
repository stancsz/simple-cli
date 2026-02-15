import { describe, it, expect, vi, beforeEach } from "vitest";
import { RagFlowServer } from "../../src/mcp_servers/ragflow/index.js";

global.fetch = vi.fn();

describe("RagFlowServer", () => {
  let server: RagFlowServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new RagFlowServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle ragflow_list_knowledge_bases", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ([]),
    });
    const result = await callTool("ragflow_list_knowledge_bases", {});
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/kb/list"),
        expect.anything()
    );
  });
});
