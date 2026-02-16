import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { readFile, unlink, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

describe("ContextServer Live", () => {
  let client: Client;
  let transport: StdioClientTransport;
  const contextDir = join(process.cwd(), ".agent");
  const contextFile = join(contextDir, "context.json");
  let originalContext: string | null = null;

  beforeAll(async () => {
    // Backup context if it exists
    if (existsSync(contextFile)) {
      originalContext = await readFile(contextFile, "utf-8");
    }

    // Connect to server
    const serverScript = join(
      process.cwd(),
      "src/mcp_servers/context_manager/index.ts",
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
    // Restore context
    if (originalContext) {
      if (!existsSync(contextDir)) {
        await mkdir(contextDir, { recursive: true });
      }
      await writeFile(contextFile, originalContext);
    } else {
      if (existsSync(contextFile)) {
        await unlink(contextFile);
      }
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
    expect(toolNames).toContain("update_context");
    expect(toolNames).toContain("read_context");
    expect(toolNames).toContain("search_memory");
    expect(toolNames).toContain("add_memory");
  });

  it("should update_context and read_context", async () => {
    await client.callTool({
      name: "update_context",
      arguments: { goal: "Live Test Goal" },
    });

    const result = await client.callTool({
      name: "read_context",
      arguments: {},
    });

    const text = (result as any).content[0].text;
    expect(text).toContain("Live Test Goal");
  });
});
