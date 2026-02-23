import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parse } from "dotenv";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// Load secrets from .env.agent
const envPath = join(process.cwd(), ".env.agent");
const secrets: Record<string, string> = {};

if (existsSync(envPath)) {
  const envConfig = parse(readFileSync(envPath));
  for (const k in envConfig) {
    if (envConfig[k]) {
        secrets[k] = envConfig[k];
    }
  }
}

// Also include current process env for fallback
for (const k in process.env) {
    if (process.env[k]) {
        secrets[k] = process.env[k]!;
    }
}

const server = new McpServer({
  name: "secret_manager",
  version: "1.0.0"
});

server.tool(
  "get_secret",
  "Retrieve a secret value securely. The value is returned and should be handled with care (not logged).",
  {
    key: z.string().describe("The key of the secret to retrieve (e.g., OPENAI_API_KEY)")
  },
  async ({ key }) => {
    const value = secrets[key];
    if (!value) {
      return { content: [{ type: "text", text: `Secret '${key}' not found.` }], isError: true };
    }
    return { content: [{ type: "text", text: value }] };
  }
);

server.tool(
  "inject_secret",
  "Store a secret in the runtime memory of the secret manager. Useful for passing temporary secrets.",
  {
    key: z.string(),
    value: z.string()
  },
  async ({ key, value }) => {
    secrets[key] = value;
    return { content: [{ type: "text", text: `Secret '${key}' stored securely in runtime memory.` }] };
  }
);

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
