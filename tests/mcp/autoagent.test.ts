import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoAgentServer } from "../../src/mcp_servers/autoagent/index.js";
import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

describe("AutoAgentServer", () => {
  let server: AutoAgentServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new AutoAgentServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle autoagent_create_agent", async () => {
    (execFile as any).mockImplementation((file: string, args: string[], options: any, cb: any) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, { stdout: "Agent created", stderr: "" });
    });

    const result = await callTool("autoagent_create_agent", {
      name: "TestAgent",
      description: "A test agent",
      llm: "gpt-4",
      tools: ["tool1", "tool2"],
    });

    expect(execFile).toHaveBeenCalledWith(
      expect.stringContaining("autoagent"),
      expect.arrayContaining(["create", "--name", "TestAgent"]),
      expect.objectContaining({ env: expect.anything() }),
      expect.anything()
    );
    expect(result.content[0].text).toContain("Agent created");
  });
});
