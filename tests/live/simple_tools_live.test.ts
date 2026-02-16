import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";

describe("SimpleToolsServer Live", () => {
  let client: Client;
  let transport: StdioClientTransport;
  const testFile = "live_test_file.txt";

  beforeAll(async () => {
    // Connect to server
    const serverScript = join(
      process.cwd(),
      "src/mcp_servers/simple_tools/index.ts",
    );

    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverScript],
    });

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    // Cleanup test file
    if (existsSync(testFile)) {
      await unlink(testFile);
    }

    // Close transport
    if (transport) {
      await transport.close();
    }
  });

  it("should list tools", async () => {
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
    const toolNames = tools.tools.map((t) => t.name);
    // Context tools removed
    expect(toolNames).not.toContain("update_context");
    expect(toolNames).not.toContain("read_context");

    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("run_command");
  });

  it("should run_command", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "echo 'Live Test'" },
    });
    const text = (result as any).content[0].text;
    expect(text).toContain("Live Test");
  });

  it("should write_file and read_file", async () => {
    await client.callTool({
      name: "write_file",
      arguments: { path: testFile, content: "Hello Live World" },
    });

    const result = await client.callTool({
      name: "read_file",
      arguments: { path: testFile },
    });

    const text = (result as any).content[0].text;
    expect(text).toBe("Hello Live World");

    // Verify file exists on disk
    const content = await readFile(testFile, "utf-8");
    expect(content).toBe("Hello Live World");
  });
});
