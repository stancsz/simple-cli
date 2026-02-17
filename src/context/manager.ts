import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { BrainClient } from "../brain/client.js";

export class ContextManager {
    private contextClient: Client | null;
    private brainClient: BrainClient | null;

    constructor(contextClient?: Client, brainClient?: BrainClient) {
        this.contextClient = contextClient || null;
        this.brainClient = brainClient || null;
    }

    async getContext(query: string, company?: string): Promise<string> {
        let combined = "";

        // 1. Fetch static context
        if (this.contextClient) {
            try {
                const res: any = await this.contextClient.callTool({
                    name: "read_context",
                    arguments: {}
                });
                if (res && res.content && res.content[0]) {
                    const data = JSON.parse(res.content[0].text);
                    if (data.company_context) {
                        combined += `[Company Context]\n${data.company_context}\n\n`;
                    }
                }
            } catch (e) {
                // Ignore context errors
            }
        }

        // 2. Fetch episodic memory (RAG)
        if (this.brainClient) {
            try {
                const memory = await this.brainClient.query(query, company);
                if (memory && !memory.includes("No relevant memories found")) {
                    combined += `[Relevant Past Experience]\n${memory}\n\n`;
                }
            } catch (e) {
                // Ignore brain errors
            }
        }

        return combined;
    }

    async updateContext(updates: any): Promise<void> {
        if (this.contextClient) {
             await this.contextClient.callTool({
                 name: "update_context",
                 arguments: { updates: JSON.stringify(updates) }
             });
        }
    }
}
