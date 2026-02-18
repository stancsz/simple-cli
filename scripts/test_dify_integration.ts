import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync, spawn } from "child_process";
import { join } from "path";

async function main() {
  console.log("Starting Dify Integration Test...");

  // 1. Check Docker
  try {
    const ps = execSync("docker compose -f docker-compose.dify.yml ps").toString();
    if (!ps.includes("dify-api") || !ps.includes("Up")) {
      console.warn("WARNING: Dify containers do not seem to be running. Attempting to start...");
      // Try to start? Or just warn.
      // execSync("docker compose -f docker-compose.dify.yml up -d", { stdio: 'inherit' });
    } else {
      console.log("✅ Dify containers are running.");
    }
  } catch (e) {
    console.warn("⚠️ Docker check failed (is docker running?). Continuing anyway...", e);
  }

  // 2. Start MCP Server
  console.log("Starting Dify MCP Server...");
  const serverPath = join(process.cwd(), "src", "mcp_servers", "dify", "index.ts");

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverPath],
    env: process.env as any
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    console.log("✅ Connected to Dify MCP Server.");

    // 3. List Tools
    const tools = await client.listTools();
    console.log("Available Tools:", tools.tools.map(t => t.name));

    if (!tools.tools.find(t => t.name === "execute_supervisor_workflow")) {
      throw new Error("Missing 'execute_supervisor_workflow' tool.");
    }
    if (!tools.tools.find(t => t.name === "execute_coding_workflow")) {
      throw new Error("Missing 'execute_coding_workflow' tool.");
    }
    console.log("✅ Tools verified.");

    // 4. Execute Workflow (only if API Key is present)
    if (process.env.DIFY_API_KEY || process.env.DIFY_SUPERVISOR_API_KEY) {
      console.log("Executing 'execute_supervisor_workflow'...");
      try {
        const result: any = await client.callTool({
          name: "execute_supervisor_workflow",
          arguments: { prompt: "Hello from integration test. What are you?" }
        });
        console.log("Result:", JSON.stringify(result, null, 2));

        if (result.isError) {
          console.error("❌ Tool execution returned error:", result.content);
        } else {
           console.log("✅ Workflow executed successfully.");
        }

      } catch (e: any) {
        console.error("❌ Failed to call tool:", e.message);
      }
    } else {
      console.log("⚠️ No DIFY_API_KEY found. Skipping real workflow execution.");
    }

  } catch (e) {
    console.error("❌ Test Failed:", e);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await client.close();
    } catch {}
  }
}

main().catch(console.error);
