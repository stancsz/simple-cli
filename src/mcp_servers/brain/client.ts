import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { randomUUID } from "crypto";

export interface PastEpisode {
  id: string;
  taskId: string;
  timestamp: number;
  userPrompt: string;
  agentResponse: string;
  artifacts: string[];
  vector?: number[];
  _distance?: number;
}

export class BrainClient {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private url: string;
  private isConnected = false;

  constructor(url: string = process.env.BRAIN_MCP_URL || "http://localhost:3002/sse") {
    this.url = url;
    this.client = new Client({ name: "brain-client", version: "1.0.0" }, { capabilities: {} });
  }

  async connect() {
    if (this.isConnected) return;
    try {
      this.transport = new SSEClientTransport(new URL(this.url));
      await this.client.connect(this.transport);
      this.isConnected = true;
    } catch (e) {
      console.warn("Failed to connect to Brain MCP:", e);
      throw e;
    }
  }

  async store_episodic_memory(taskId: string, request: string, solution: string, artifacts: string[] = []) {
    if (!this.isConnected) await this.connect();
    return this.client.callTool({
      name: "brain_store",
      arguments: {
        taskId,
        request,
        solution,
        artifacts: JSON.stringify(artifacts)
      }
    });
  }

  async retrieve_relevant_memories(query: string, limit: number = 3): Promise<PastEpisode[]> {
    if (!this.isConnected) await this.connect();

    const result = await this.client.callTool({
      name: "brain_query",
      arguments: {
        query,
        limit,
        format: "json"
      }
    }) as any;

    if (!result || !result.content) return [];

    const textContent = result.content.find((c: any) => c.type === "text");
    if (textContent && textContent.type === "text") {
        try {
            const data = JSON.parse(textContent.text);
            if (Array.isArray(data)) return data as PastEpisode[];
            return [];
        } catch {
            return [];
        }
    }
    return [];
  }
}
