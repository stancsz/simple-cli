import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";
import { StatusGenerator } from "./status_generator.js";
import { PersonaFormatter } from "./persona_formatter.js";
import { createLLM } from "../../llm/index.js";

const server = new McpServer({
  name: "operational_persona",
  version: "1.0.0",
});

let statusGenerator: StatusGenerator;
let personaFormatter: PersonaFormatter;

function findServerScript(name: string): { command: string, args: string[] } | null {
    const distPath = join(process.cwd(), "dist", "mcp_servers", name, "index.js");
    if (existsSync(distPath)) {
        return { command: "node", args: [distPath] };
    }
    const srcPath = join(process.cwd(), "src", "mcp_servers", name, "index.ts");
    if (existsSync(srcPath)) {
        return { command: "npx", args: ["tsx", srcPath] };
    }
    return null;
}

async function connectToSubServer(name: string): Promise<Client> {
    const script = findServerScript(name);
    if (!script) {
        throw new Error(`Could not find script for server: ${name}`);
    }

    const transport = new StdioClientTransport({
        command: script.command,
        args: script.args,
        env: process.env as any
    });

    const client = new Client(
        { name: "operational-persona-client", version: "1.0.0" },
        { capabilities: {} }
    );

    await client.connect(transport);
    return client;
}

server.tool(
  "get_system_status",
  "Get current system status (health, alerts, latency).",
  {},
  async () => {
    try {
        const rawStatus = await statusGenerator.getSystemStatus();
        const formatted = await personaFormatter.format(rawStatus);
        return { content: [{ type: "text", text: formatted }] };
    } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_agent_activity_report",
  "Get summary of recent autonomous agent activities (Job Delegator, Reviewer, Dreaming).",
  {},
  async () => {
    try {
        const rawReport = await statusGenerator.getAgentActivityReport();
        const formatted = await personaFormatter.format(rawReport);
        return { content: [{ type: "text", text: formatted }] };
    } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "generate_daily_standup",
  "Generate a complete daily standup report and optionally post to Slack.",
  {
    post: z.boolean().optional().describe("Whether to post the report to Slack (requires SLACK_WEBHOOK_URL)."),
  },
  async ({ post }: { post?: boolean }) => {
    try {
        const status = await statusGenerator.getSystemStatus();
        const activity = await statusGenerator.getAgentActivityReport();

        const rawMessage = `*Daily Standup*\n\n*System Status:*\n${status}\n\n*Agent Activity:*\n${activity}`;
        const formatted = await personaFormatter.format(rawMessage);

        if (post && process.env.SLACK_WEBHOOK_URL) {
            try {
                const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: formatted })
                });
                if (!response.ok) {
                    console.error(`Failed to post to Slack: ${response.statusText}`);
                }
            } catch (postError) {
                console.error("Error posting to Slack:", postError);
            }
        }

        return { content: [{ type: "text", text: formatted }] };
    } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "generate_dashboard_summary",
  "Generate a concise, natural language summary for the dashboard based on provided metrics.",
  {
    metrics: z.string().describe("JSON string of aggregated metrics"),
    activity: z.string().optional().describe("Recent activity summary or JSON"),
  },
  async ({ metrics, activity }) => {
    try {
        const llm = createLLM();
        const prompt = `
Analyze the following system metrics and generate a concise, natural language status update for the operational dashboard.
Focus on the overall health, key performance indicators (latency, errors, costs), and any notable activity.
Do not just list numbers; tell a story about how the system is performing.

Metrics:
${metrics}

Activity:
${activity || "No specific recent activity reported."}

Keep it under 3-4 sentences.
`;
        // The LLM response will be automatically transformed by the PersonaEngine inside LLM class
        // because createLLM initializes LLM with PersonaEngine.
        // We pass a dummy user message because some providers require non-empty messages.
        const response = await llm.generate(prompt, [{ role: 'user', content: 'Generate status report.' }]);
        return { content: [{ type: "text", text: response.message || "" }] };
    } catch (e: any) {
        return { content: [{ type: "text", text: `Error generating summary: ${e.message}` }], isError: true };
    }
  }
);

async function main() {
  console.log("Starting Operational Persona MCP Server...");

  // Initialize Persona Formatter
  personaFormatter = new PersonaFormatter();
  await personaFormatter.init();

  // Connect to dependencies (unless disabled to prevent circular dependency)
  if (process.env.MCP_DISABLE_DEPENDENCIES === 'true') {
      console.log("Skipping connection to dependencies (MCP_DISABLE_DEPENDENCIES=true).");
  } else {
      try {
          const brainClient = await connectToSubServer("brain");
          const healthClient = await connectToSubServer("health_monitor");
          statusGenerator = new StatusGenerator(brainClient, healthClient);
          console.log("Connected to Brain and Health Monitor.");
      } catch (e) {
          console.error("Failed to connect to dependencies:", e);
          process.exit(1);
      }
  }

  if (process.env.PORT) {
    const app = express();
    const transport = new StreamableHTTPServerTransport();
    await server.connect(transport);

    app.all("/sse", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.post("/messages", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.get("/health", (req, res) => {
      res.sendStatus(200);
    });

    const port = process.env.PORT;
    app.listen(port, () => {
      console.error(`Operational Persona MCP Server running on http://localhost:${port}/sse`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Operational Persona MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
