import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { integrate_framework } from '../../src/mcp_servers/framework_analyzer/tools.js';

// Mock LLM
const mockGenerate = vi.fn();
vi.mock('../../src/llm.js', () => ({
  createLLM: () => ({
    generate: mockGenerate,
  }),
}));

describe('Autonomous Framework Integration', () => {
  const frameworkName = 'dummy_autonomous_test';
  const serverDir = join(process.cwd(), 'src', 'mcp_servers', frameworkName);
  const stagingPath = join(process.cwd(), 'mcp.staging.json');

  beforeEach(() => {
    vi.clearAllMocks();
    // Cleanup before test
    if (existsSync(serverDir)) {
      rmSync(serverDir, { recursive: true, force: true });
    }
    // We don't want to nuke the staging file if it exists from other tests, but likely it doesn't.
    // We'll read it if it exists to restore later, but for now we assume we can just manage our entry.
  });

  afterEach(() => {
    // Cleanup after test
    if (existsSync(serverDir)) {
      rmSync(serverDir, { recursive: true, force: true });
    }

    // Clean up staging entry
    if (existsSync(stagingPath)) {
        try {
            const content = JSON.parse(readFileSync(stagingPath, 'utf-8'));
            if (content.mcpServers && content.mcpServers[frameworkName]) {
                delete content.mcpServers[frameworkName];
                writeFileSync(stagingPath, JSON.stringify(content, null, 2));
            }
        } catch (e) {
            // Ignore
        }
    }
  });

  it('should successfully analyze, scaffold, test, and register a new framework', async () => {
    // 1. Mock Analysis Response
    const analysisResult = {
        description: "Dummy SDK",
        tools: [{ name: "hello", description: "Say hello", args: [{ name: "name", type: "string" }] }]
    };

    mockGenerate.mockResolvedValueOnce({
        tool: "analysis_result",
        args: analysisResult
    });

    // 2. Mock Scaffold Response
    const scaffoldFiles = {
        "index.ts": `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "${frameworkName}",
  version: "1.0.0",
});

server.tool(
  "hello",
  "A hello world tool",
  { name: z.string() },
  async ({ name }) => {
    return { content: [{ type: "text", text: "Hello, " + name + "!" }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
`,
        "README.md": "# Dummy Framework\n\nTest server.",
        "config.json": JSON.stringify({ name: frameworkName, version: "1.0.0" })
    };

    mockGenerate.mockResolvedValueOnce({
        tool: "scaffold_result",
        args: { files: scaffoldFiles }
    });

    // 3. Create a dummy SDK file to analyze
    const sdkPath = join(process.cwd(), 'dummy_sdk.ts');
    writeFileSync(sdkPath, "export const hello = (name: string) => `Hello ${name}`;");

    try {
        // 4. Run integration
        // We use a high timeout because it spawns child processes (npx tsx)
        console.log("Starting integrate_framework...");
        const result = await integrate_framework(frameworkName, 'sdk', sdkPath);
        console.log("integrate_framework result:", result);

        // 5. Verify results
        expect(result.success).toBe(true);
        expect(result.message).toContain('integrated and validated successfully');
        expect(existsSync(join(serverDir, 'index.ts'))).toBe(true);
        expect(existsSync(join(serverDir, 'basic.test.ts'))).toBe(true);

        // Verify staging file
        expect(existsSync(stagingPath)).toBe(true);
        const stagingContent = JSON.parse(readFileSync(stagingPath, 'utf-8'));
        expect(stagingContent.mcpServers).toHaveProperty(frameworkName);
        expect(stagingContent.mcpServers[frameworkName].command).toBe("npx");
        expect(stagingContent.mcpServers[frameworkName].args[0]).toBe("tsx");
        expect(stagingContent.mcpServers[frameworkName].args[1]).toContain("index.ts");

    } finally {
        // Cleanup dummy SDK
        if (existsSync(sdkPath)) rmSync(sdkPath);
    }
  }, 120000); // 2 minute timeout
});
