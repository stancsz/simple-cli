export const testTemplate = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "{{SERVER_PATH}}"],
    env: {
      ...process.env,
      PATH: process.env.PATH,
    }
  });

  const client = new Client(
    {
      name: "integration-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log("Connected to server.");

    const tools = await client.listTools();
    console.log("Tools found:", tools.tools.map((t: any) => t.name));

    if (tools.tools.length > 0) {
      console.log("Test Passed: Tools listed successfully.");
      process.exit(0);
    } else {
      console.error("Test Failed: No tools found.");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("Test Failed:", error);
    process.exit(1);
  }
}

main();
`;
