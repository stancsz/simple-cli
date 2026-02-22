import { describe, it, expect, vi } from "vitest";
import { DreamingServer } from "../../src/mcp_servers/dreaming/index.js";

// Mock MCP Logic
class MockMCPClient {
    constructor(private name: string) {}
    async callTool({ name, arguments: args }: any) {
        if (this.name === "brain") {
            if (name === "brain_query") {
                if (args.query.includes("failure")) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify([{
                                id: "fail-1",
                                taskId: "task-1",
                                userPrompt: "fix it",
                                agentResponse: "failure: err",
                                simulation_attempts: []
                            }])
                        }]
                    };
                }
                if (args.query.includes("Dreaming Resolved")) {
                     // Simulate updated state (simplified)
                     return {
                        content: [{
                            type: "text",
                            text: JSON.stringify([{
                                id: "fail-1",
                                taskId: "task-1",
                                userPrompt: "fix it",
                                agentResponse: "[Dreaming Resolved] Success: Fixed.",
                                simulation_attempts: [],
                                resolved_via_dreaming: true
                            }])
                        }]
                    };
                }
                return { content: [{ type: "text", text: "[]" }] };
            }
            if (name === "brain_delete_episode") {
                return { content: [{ type: "text", text: "Deleted" }] };
            }
            if (name === "brain_store") {
                return { content: [{ type: "text", text: "Stored" }] };
            }
        }
        if (this.name === "swarm-server") {
            if (name === "list_agents") {
                return { content: [{ type: "text", text: "[]" }] };
            }
            if (name === "run_simulation") {
                return { content: [{ type: "text", text: "Success: Fixed." }] };
            }
        }
        return { content: [] };
    }
}

class MockMCP {
    async init() {}
    getClient(name: string) { return new MockMCPClient(name); }
}

describe("Dreaming Integration", () => {
    it("should replay failures and update brain", async () => {
        const server = new DreamingServer();
        // Inject Mock MCP
        (server as any).mcp = new MockMCP();

        const res: any = await server.startSession(1, "test-corp");

        expect(res.content[0].text).toContain("Dreaming session complete");
        expect(res.content[0].text).toContain("Fixed failure task-1");
    });
});
