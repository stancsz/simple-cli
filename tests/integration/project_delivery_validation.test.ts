import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Project Delivery Validation", () => {
    let registerProjectDeliveryTools: any;
    let mockStore: any;
    let mockRetrieve: any;
    let mockInit: any;
    let mockUpdateIssue: any;
    let mockCreateComment: any;
    let mockIssues: any;
    let mockProject: any;
    let mockCreateIssue: any;
    let mockIssueLabels: any;
    let mockCreateIssueLabel: any;

    beforeEach(async () => {
        vi.resetModules();
        process.env.LINEAR_API_KEY = "mock_key";
        process.env.GITHUB_TOKEN = "mock_gh_token";

        // Mock Brain
        mockStore = vi.fn().mockResolvedValue({ id: "mem_1" });
        mockRetrieve = vi.fn().mockResolvedValue([]);
        mockInit = vi.fn().mockResolvedValue(undefined);

        vi.doMock("../../src/brain/episodic.js", () => {
            return {
                EpisodicMemory: class {
                    init = mockInit;
                    store = mockStore;
                    retrieve = mockRetrieve;
                }
            };
        });

        // Mock Linear SDK
        mockUpdateIssue = vi.fn().mockResolvedValue({ success: true });
        mockCreateComment = vi.fn().mockResolvedValue({ success: true });
        mockIssues = vi.fn().mockResolvedValue({ nodes: [] });
        mockProject = vi.fn().mockResolvedValue({ name: "Mock Project", issues: mockIssues, description: "https://github.com/owner/repo" });
        mockCreateIssue = vi.fn().mockResolvedValue({ success: true });
        mockIssueLabels = vi.fn().mockResolvedValue({ nodes: [] });
        mockCreateIssueLabel = vi.fn().mockResolvedValue({ issueLabel: Promise.resolve({ id: "label_esc" }) });

        vi.doMock("@linear/sdk", () => {
            return {
                LinearClient: class {
                    issue = vi.fn();
                    issues = mockIssues;
                    updateIssue = mockUpdateIssue;
                    createComment = mockCreateComment;
                    project = mockProject;
                    createIssue = mockCreateIssue;
                    issueLabels = mockIssueLabels;
                    createIssueLabel = mockCreateIssueLabel;
                }
            };
        });

        // Mock FS
        vi.doMock("fs/promises", async () => {
            return {
                writeFile: vi.fn().mockResolvedValue(undefined),
                mkdir: vi.fn().mockResolvedValue(undefined),
                access: vi.fn().mockResolvedValue(undefined),
            };
        });

        vi.doMock("fs", async () => {
             return {
                 existsSync: vi.fn().mockReturnValue(false),
                 mkdirSync: vi.fn(),
                 promises: {
                     writeFile: vi.fn().mockResolvedValue(undefined),
                     mkdir: vi.fn().mockResolvedValue(undefined)
                 }
             };
        });

        // Mock Global Fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { sha: "abc1234", commit: { message: "Fix bug", author: { name: "Dev" } } }
            ])
        });

        // Import the module under test
        const module = await import("../../src/mcp_servers/business_ops/tools/project_delivery.js");
        registerProjectDeliveryTools = module.registerProjectDeliveryTools;
    });

    it("should track milestone progress", async () => {
        const tools: Record<string, any> = {};
        const server = { tool: (n, d, s, h) => tools[n] = h };
        registerProjectDeliveryTools(server);
        const trackMilestoneTool = tools["track_milestone_progress"];

        const mockIssue = {
            id: "issue_123",
            team: Promise.resolve({
                states: () => Promise.resolve({
                    nodes: [{ id: "state_done", name: "Done" }]
                })
            })
        };
        mockIssues.mockResolvedValue({ nodes: [mockIssue] });

        const result = await trackMilestoneTool({
            project_id: "proj_1",
            milestone_name: "Milestone A",
            status: "Done",
            notes: "Finished testing"
        });

        expect(result.content[0].text).toContain("Updated milestone 'Milestone A' to 'Done'");
        expect(mockUpdateIssue).toHaveBeenCalledWith("issue_123", { stateId: "state_done" });
    });

    it("should generate client report with git activity", async () => {
        const tools: Record<string, any> = {};
        const server = { tool: (n, d, s, h) => tools[n] = h };
        registerProjectDeliveryTools(server);
        const generateReportTool = tools["generate_client_report"];

        const mockIssueNodes = [
            {
                title: "Task 1",
                identifier: "T-1",
                state: Promise.resolve({ type: "completed", name: "Done" })
            }
        ];
        mockIssues.mockResolvedValue({ nodes: mockIssueNodes });
        mockRetrieve.mockResolvedValue(["Key Event 1"]);

        const result = await generateReportTool({
            project_id: "proj_1",
            period_start: "2023-01-01",
            period_end: "2023-01-07"
        });

        expect(result.content[0].text).toContain("Report generated successfully");

        // Check Fetch call
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("api.github.com/repos/owner/repo/commits"), expect.anything());
    });

    it("should escalate blockers and apply label", async () => {
        const tools: Record<string, any> = {};
        const server = { tool: (n, d, s, h) => tools[n] = h };
        registerProjectDeliveryTools(server);
        const escalateBlockersTool = tools["escalate_blockers"];

        const mockIssueNodes = [
            {
                id: "issue_blocked",
                title: "Blocked Task",
                identifier: "T-3",
                teamId: "team_1",
                team: Promise.resolve({ id: "team_1" }),
                url: "http://linear/issue_blocked",
                state: Promise.resolve({ name: "Blocked" }),
                labels: () => Promise.resolve({ nodes: [] })
            }
        ];

        mockIssues.mockResolvedValue({ nodes: mockIssueNodes });

        const result = await escalateBlockersTool({
            project_id: "proj_1"
        });

        expect(result.content[0].text).toContain("Escalated the following blocked issues: Blocked Task");

        // Verify Label Creation
        expect(mockCreateIssueLabel).toHaveBeenCalledWith(expect.objectContaining({ name: "Escalated" }));

        // Verify Label Application
        expect(mockUpdateIssue).toHaveBeenCalledWith("issue_blocked", expect.objectContaining({
            labelIds: expect.arrayContaining(["label_esc"])
        }));

        // Verify Escalation Issue Creation
        expect(mockCreateIssue).toHaveBeenCalledWith(expect.objectContaining({
            title: "Escalation: Blocked Task"
        }));
    });
});
