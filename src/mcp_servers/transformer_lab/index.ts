import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

async function callTransformerLab(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const TRANSFORMER_LAB_URL = process.env.TRANSFORMER_LAB_URL || "http://localhost:8000";

  const url = `${TRANSFORMER_LAB_URL.replace(/\/$/, "")}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Transformer Lab API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

export class TransformerLabServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "transformer-lab-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "tl_list_models",
      "List all models in Transformer Lab.",
      {},
      async () => {
        const models = await callTransformerLab("/api/models");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(models, null, 2) }],
        };
      }
    );

    this.server.tool(
      "tl_train_model",
      "Start a training job in Transformer Lab.",
      {
        base_model: z.string().describe("The base model to fine-tune."),
        dataset: z.string().describe("The dataset to use for training."),
        parameters: z.record(z.any()).optional().describe("Training parameters (epochs, learning rate, etc.)."),
      },
      async ({ base_model, dataset, parameters }) => {
        const result = await callTransformerLab(
          "/api/train",
          "POST",
          { base_model, dataset, ...(parameters || {}) },
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Transformer Lab MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new TransformerLabServer().run().catch((error) => {
    console.error("Fatal error in Transformer Lab MCP Server:", error);
    process.exit(1);
  });
}
