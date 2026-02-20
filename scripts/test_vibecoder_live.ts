import { MCP } from "../src/mcp.js";

async function main() {
  const mcp = new MCP();
  await mcp.init();

  console.log("Starting vibecoder server...");
  try {
    const startRes = await mcp.startServer("vibecoder");
    console.log(startRes);
  } catch (e: any) {
    console.error("Failed to start server:", e.message);
  }

  const client = mcp.getClient("vibecoder");
  if (!client) {
    console.error("Client not found!");
    process.exit(1);
  }

  console.log("Calling vibecoder_init_project...");
  try {
    const initRes = await client.callTool({ name: "vibecoder_init_project", arguments: {} });
    console.log("Init Result:", JSON.stringify(initRes, null, 2));
  } catch (e: any) {
    console.error("Init failed:", e.message);
  }

  console.log("Calling vibecoder_strategize (ask)...");
  try {
    const stratRes = await client.callTool({
        name: "vibecoder_strategize",
        arguments: { mode: "ask", context: "I want to build a simple Todo app with React and Vite." }
    });
    console.log("Strategist Result:", JSON.stringify(stratRes, null, 2));
  } catch (e: any) {
    console.error("Strategist failed:", e.message);
  }

  // Clean up
  await mcp.stopServer("vibecoder");
}

main().catch(console.error);
