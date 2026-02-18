import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

interface CoworkMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export class OpenCoworkServer {
  private server: McpServer;
  private messages: Map<string, CoworkMessage[]> = new Map();

  constructor() {
    this.server = new McpServer({
      name: "opencowork-server",
      version: "0.1.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "send_message",
      "Send a message to another agent.",
      {
        from: z.string().describe("The ID or name of the sender agent."),
        to: z.string().describe("The ID or name of the recipient agent."),
        content: z.string().describe("The content of the message."),
      },
      async ({ from, to, content }) => {
        return {
          content: [
            {
              type: "text",
              text: this.sendMessage(from, to, content),
            },
          ],
        };
      }
    );

    this.server.tool(
      "read_messages",
      "Read messages sent to a specific agent.",
      {
        agent_id: z.string().describe("The ID or name of the agent to read messages for."),
      },
      async ({ agent_id }) => {
        const msgs = this.readMessages(agent_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(msgs, null, 2),
            },
          ],
        };
      }
    );
  }

  sendMessage(from: string, to: string, content: string): string {
    const msg: CoworkMessage = { from, to, content, timestamp: Date.now() };

    if (!this.messages.has(to)) {
      this.messages.set(to, []);
    }
    this.messages.get(to)!.push(msg);

    return `Message sent to ${to}.`;
  }

  readMessages(agentId: string): CoworkMessage[] {
    return this.messages.get(agentId) || [];
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenCowork MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new OpenCoworkServer();
  server.run().catch((err) => {
    console.error("Fatal error in OpenCowork MCP Server:", err);
    process.exit(1);
  });
}
