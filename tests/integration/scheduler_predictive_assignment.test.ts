import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerServer } from '../../src/mcp_servers/scheduler/index.js';
import * as llm from '../../src/llm.js';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: class MockClient {
            name: string;
            constructor(options: any) {
                this.name = options.name;
            }
            async connect() {}
            async close() {}
            async callTool(options: any) {
                if (this.name === "scheduler-brain-client" && options.name === "analyze_ecosystem_patterns") {
                    return {
                        content: [{ type: "text", text: JSON.stringify({
                            patterns: [
                                { agency_id: "agency_alpha", success_rate: 0.95, avg_duration_ms: 5000, specialization: ["backend", "data_processing"] },
                                { agency_id: "agency_beta", success_rate: 0.88, avg_duration_ms: 4000, specialization: ["frontend", "ui_design"] }
                            ]
                        }) }]
                    };
                }
                if (this.name === "scheduler-orch-client" && options.name === "get_agency_status") {
                    return {
                        content: [{ type: "text", text: JSON.stringify({
                            statuses: [
                                { agency_id: "agency_alpha", status: "idle", current_load: 0.1 },
                                { agency_id: "agency_beta", status: "busy", current_load: 0.9 }
                            ]
                        }) }]
                    };
                }
                return { content: [] };
            }
        }
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: class MockTransport {
            constructor() {}
        }
    };
});

vi.mock('proper-lockfile', () => ({
    default: {
        lock: vi.fn().mockResolvedValue(vi.fn())
    }
}));

describe('Phase 35: Scheduler Predictive Task Assignment Validation', () => {
    let schedulerServer: SchedulerServer;

    beforeEach(() => {
        vi.clearAllMocks();
        schedulerServer = new SchedulerServer();
    });

    it('should assign a backend task to agency_alpha based on patterns and idle status', async () => {
        const mockGenerate = vi.fn().mockResolvedValue({
            raw: JSON.stringify({
                recommended_agency_id: "agency_alpha",
                confidence_score: 0.92,
                reasoning: "agency_alpha specializes in backend tasks with a high success rate (95%) and is currently idle."
            }),
            thought: "",
            tool: "none",
            args: {},
            message: ""
        });

        vi.spyOn(llm, 'createLLM').mockReturnValue({
            generate: mockGenerate,
            embed: vi.fn()
        } as any);

        const tools = (schedulerServer as any).server._registeredTools || (schedulerServer as any).server._tools || (schedulerServer as any).server.tools;
        let assignTool;
        if (tools instanceof Map) {
            assignTool = tools.get("assign_task_predictively");
        } else if (tools) {
            assignTool = tools["assign_task_predictively"] || Object.values(tools).find((t: any) => t.name === "assign_task_predictively");
        }
        expect(assignTool).toBeDefined();

        const result = await assignTool.handler({
            task_description: "Build a new scalable database schema and backend API for user profiles.",
            priority: "high"
        }, {});

        if (result.isError) {
            console.error("Test error result:", result.content[0].text);
        }
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.recommended_agency_id).toBe("agency_alpha");
        expect(parsed.confidence_score).toBe(0.92);
        expect(parsed.reasoning).toContain("backend");
        expect(mockGenerate).toHaveBeenCalled();

        // Ensure prompt contains patterns and status
        const callArgs = mockGenerate.mock.calls[0];
        const promptContent = callArgs[1][0].content;
        expect(promptContent).toContain("agency_alpha");
        expect(promptContent).toContain("agency_beta");
        expect(promptContent).toContain("Build a new scalable database schema");
    });
});
