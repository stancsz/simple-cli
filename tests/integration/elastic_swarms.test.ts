import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { spawn, ChildProcess } from "child_process";

describe("Elastic Swarms Integration", () => {
  let client: Client;
  let transport: StdioClientTransport;

  // Helper to start server with specific env
  const startServer = async (envOverrides: Record<string, string>) => {
    const serverPath = join(process.cwd(), "src/mcp_servers/business_ops/index.ts");
    const env = {
        ...process.env,
        ...envOverrides,
        SWARM_SERVER_SCRIPT: join(process.cwd(), "tests/mocks/mock_swarm_server.ts")
    };

    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverPath],
      env: env
    });

    const newClient = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await newClient.connect(transport);
    return newClient;
  };

  afterAll(async () => {
    if (client) await client.close();
  });

  it("should list available tools including swarm tools", async () => {
    client = await startServer({});
    const tools = await client.listTools();
    const toolNames = tools.tools.map(t => t.name);
    expect(toolNames).toContain("scale_swarm");
    expect(toolNames).toContain("run_swarm_manager_cycle");
    await client.close();
  });

  it("should trigger scale up when metrics exceed threshold", async () => {
    // Current MOCK_LINEAR_OPEN_ISSUES = 100 (> 50)
    // Rule says: scale_up count: 2 for triage_agent
    client = await startServer({
        MOCK_LINEAR_OPEN_ISSUES: "100",
        MOCK_HUBSPOT_UNREAD_CONVERSATIONS: "10",
        JULES_COMPANY: "test-company"
    });

    const result = await client.callTool({
        name: "run_swarm_manager_cycle",
        arguments: {}
    });

    const text = (result as any).content[0].text;
    console.log("Scale Up Output:", text);

    expect(text).toContain("Triggered scale_up for triage_agent");
    expect(text).toContain("Spawned 2 agents");
    expect(text).toContain("Triggered scale_up for billing_agent");
    await client.close();
  }, 60000);

  it("should trigger scale down when metrics drop", async () => {
    // Scale Down Test
    // 1. Start server with Low metrics
    client = await startServer({
        MOCK_LINEAR_OPEN_ISSUES: "5", // Should trigger scale down (<= 10)
        MOCK_HUBSPOT_UNREAD_CONVERSATIONS: "0"
    });

    // 2. Manually spawn agents so we have something to kill
    await client.callTool({
        name: "scale_swarm",
        arguments: { swarm_type: "triage_agent", action: "scale_up", count: 2 }
    });

    // 3. Trigger cycle (metrics are low)
    const result = await client.callTool({
        name: "run_swarm_manager_cycle",
        arguments: {}
    });

    const text = (result as any).content[0].text;
    console.log("Scale Down Output:", text);

    expect(text).toContain("Triggered scale_down for triage_agent");
    expect(text).toContain("Terminated");
  }, 60000);

  it("should manually scale swarm", async () => {
      client = await startServer({});
      const result = await client.callTool({
          name: "scale_swarm",
          arguments: { swarm_type: "manual_agent", action: "scale_up", count: 1 }
      });
      const text = (result as any).content[0].text;
      expect(text).toContain("Spawned 1 agents");
      await client.close();
  }, 30000);

});
