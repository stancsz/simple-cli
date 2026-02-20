import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { MCP } from '../../src/mcp.js';
import { ContextData } from '../../src/core/context.js';
import { tmpdir } from 'os';

// Helper to wait
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Context MCP Server Concurrency Integration', () => {
  let tempDir: string;
  let mcp: MCP;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    // Create a temp directory for this test run
    tempDir = join(tmpdir(), `simple-cli-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Path to the server script
    const serverScript = resolve(originalCwd, 'src/mcp_servers/context_server/index.ts');

    // Create mcp.json in temp dir to point to the server script
    const mcpConfig = {
      mcpServers: {
        context_server: {
          command: "npx",
          args: ["tsx", serverScript],
          env: { ...process.env } // Pass env vars
        }
      }
    };
    writeFileSync(join(tempDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2));

    // Change CWD to temp dir so ContextServer uses it for storage
    process.chdir(tempDir);

    // Initialize MCP
    mcp = new MCP();
    await mcp.init();

    // Start the server
    await mcp.startServer("context_server");
    // Give it a moment to stabilize
    await sleep(2000);
  }, 30000); // Increase timeout for build/start

  afterAll(async () => {
    // Stop server
    if (mcp) {
      await mcp.stopServer("context_server");
    }
    // Restore CWD
    process.chdir(originalCwd);
    // Cleanup temp dir
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
        console.warn("Failed to cleanup temp dir:", e);
    }
  });

  it('should handle concurrent updates without data loss', async () => {
    const client = mcp.getClient("context_server");
    expect(client).toBeDefined();
    if (!client) return;

    // Initial state
    await client.callTool({
        name: "update_context",
        arguments: {
            updates: JSON.stringify({ active_tasks: [] })
        }
    });

    // We use distinct fields to verify that concurrent updates don't overwrite the whole file state (read-modify-write race).
    // If locking works, each update reads the LATEST state (including previous updates) before merging.
    const updates = [
        { active_tasks: ["task-0"] },
        { goals: ["goal-1"] },
        { constraints: ["constraint-2"] },
        { recent_changes: ["change-3"] },
        { working_memory: "memory-4" }
    ];

    const promises = updates.map((update, i) => async () => {
        try {
            await client.callTool({
                name: "update_context",
                arguments: {
                    updates: JSON.stringify(update)
                }
            });
        } catch (e) {
            console.error(`Update ${i} failed:`, e);
            throw e;
        }
    });

    // Execute all concurrently
    await Promise.all(promises.map(p => p()));

    // Verify final state
    const result: any = await client.callTool({
        name: "read_context",
        arguments: {}
    });
    const context = JSON.parse(result.content[0].text);

    // Check if file is valid JSON (implicit by parse success)
    expect(context).toBeDefined();

    // Verify all updates are present
    expect(context.active_tasks).toContain("task-0");
    expect(context.goals).toContain("goal-1");
    expect(context.constraints).toContain("constraint-2");
    expect(context.recent_changes).toContain("change-3");
    expect(context.working_memory).toBe("memory-4");
  });

  it('should support company-specific context isolation', async () => {
    const client = mcp.getClient("context_server");
    if (!client) return;

    await client.callTool({
        name: "update_context",
        arguments: {
            updates: JSON.stringify({ goals: ["Global Goal"] })
        }
    });

    await client.callTool({
        name: "update_context",
        arguments: {
            updates: JSON.stringify({ goals: ["Company Goal"] }),
            company: "AcmeCorp"
        }
    });

    // Read Global
    const globalRes: any = await client.callTool({ name: "read_context", arguments: {} });
    const globalCtx = JSON.parse(globalRes.content[0].text);
    expect(globalCtx.goals).toContain("Global Goal");
    expect(globalCtx.goals).not.toContain("Company Goal");

    // Read Company
    const companyRes: any = await client.callTool({ name: "read_context", arguments: { company: "AcmeCorp" } });
    const companyCtx = JSON.parse(companyRes.content[0].text);
    expect(companyCtx.goals).toContain("Company Goal");
    expect(companyCtx.goals).not.toContain("Global Goal");
  });
});
