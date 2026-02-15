import { describe, it, expect, vi, beforeEach } from "vitest";
import { LlamaFactoryServer } from "../../src/mcp_servers/llama_factory/index.js";
import { execFile } from "child_process";
import { tmpdir } from "os";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    writeFile: async () => {},
    mkdtemp: async () => "/tmp/test-llama",
    rm: async () => {},
  },
  writeFile: async () => {},
  mkdtemp: async () => "/tmp/test-llama",
  rm: async () => {},
}));

describe("LlamaFactoryServer", () => {
  let server: LlamaFactoryServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new LlamaFactoryServer();
  });

  const callTool = async (name: string, args: any) => {
    const tool = (server as any).server._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle llama_train", async () => {
    (execFile as any).mockImplementation((file: string, args: string[], cb: any) => {
      cb(null, { stdout: "Training started", stderr: "" });
    });

    const result = await callTool("llama_train", { config: { foo: "bar" } });

    expect(execFile).toHaveBeenCalledWith(
        expect.stringContaining("llamafactory-cli"),
        expect.arrayContaining(["train", expect.stringContaining("train_config.json")]),
        expect.anything()
    );
    expect(result.content[0].text).toContain("Training started");
  });
});
