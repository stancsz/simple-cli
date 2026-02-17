import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

export interface MemoryResult {
  taskId: string;
  timestamp: string;
  userPrompt: string;
  agentResponse: string;
  artifacts: string[];
}

export class BrainClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private isSelfManaged: boolean = false;

  constructor(existingClient?: Client) {
    if (existingClient) {
      this.client = existingClient;
    } else {
        this.isSelfManaged = true;
        this.client = new Client({ name: "brain-client", version: "1.0.0" }, { capabilities: {} });
    }
  }

  async connect() {
      if (this.isSelfManaged && !this.transport) {
          const serverPath = join(process.cwd(), "src", "mcp_servers", "brain.ts");
          this.transport = new StdioClientTransport({
              command: "npx",
              args: ["tsx", serverPath],
              env: process.env
          });
          await this.client.connect(this.transport);
      }
  }

  async query(query: string, company?: string): Promise<string> {
    try {
      const result: any = await this.client.callTool({
        name: "brain_query",
        arguments: {
          query,
          company
        }
      });
      if (result && result.content && result.content[0]) {
        return result.content[0].text;
      }
    } catch (e: any) {
       // console.warn("Brain query failed:", e.message);
    }
    return "";
  }

  async store(taskId: string, request: string, solution: string, artifacts?: string[], company?: string): Promise<void> {
    try {
      await this.client.callTool({
        name: "brain_store",
        arguments: {
          taskId,
          request,
          solution,
          artifacts: JSON.stringify(artifacts || []),
          company
        }
      });
    } catch (e: any) {
      // console.warn("Brain store failed:", e.message);
    }
  }

  async close() {
      if (this.transport) {
          await this.transport.close();
      }
  }
}
