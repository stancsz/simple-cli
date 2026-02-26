import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerProjectDeliveryTools } from "../../src/mcp_servers/business_ops/tools/project_delivery.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// --- Mocks ---

const {
    mockSimpleGit,
    mockGitAdd,
    mockGitCommit,
    mockGitPush,
    mockGitCheckIsRepo,
    mockWriteFile,
    mockMkdir,
    mockAccess,
    mockLinearIssues,
    mockLinearUpdateIssue,
    mockLinearCreateIssue,
    mockLinearCreateComment,
    mockLinearIssueLabels,
    mockLinearCreateIssueLabel,
    mockLinearProject,
    mockStore,
    mockRecall,
    mockInit
} = vi.hoisted(() => {
    const mockAdd = vi.fn();
    const mockCommit = vi.fn();
    const mockPush = vi.fn();
    const mockCheckIsRepo = vi.fn().mockResolvedValue(true);

    return {
        mockSimpleGit: vi.fn(() => ({
            add: mockAdd,
            commit: mockCommit,
            push: mockPush,
            checkIsRepo: mockCheckIsRepo
        })),
        mockGitAdd: mockAdd,
        mockGitCommit: mockCommit,
        mockGitPush: mockPush,
        mockGitCheckIsRepo: mockCheckIsRepo,
        mockWriteFile: vi.fn(),
        mockMkdir: vi.fn(),
        mockAccess: vi.fn().mockResolvedValue(true),
        mockLinearIssues: vi.fn(),
        mockLinearUpdateIssue: vi.fn(),
        mockLinearCreateIssue: vi.fn(),
        mockLinearCreateComment: vi.fn(),
        mockLinearIssueLabels: vi.fn(),
        mockLinearCreateIssueLabel: vi.fn(),
        mockLinearProject: vi.fn(),
        mockStore: vi.fn(),
        mockRecall: vi.fn(),
        mockInit: vi.fn()
    };
});

// Mock simple-git
vi.mock("simple-git", () => ({
    default: mockSimpleGit,
    simpleGit: mockSimpleGit
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess
}));
// Also mock existsSync which is imported from 'fs' in some files
vi.mock("fs", () => ({
    existsSync: () => true,
    promises: {
        writeFile: mockWriteFile,
        mkdir: mockMkdir,
        access: mockAccess
    }
}));

// Mock Linear SDK
vi.mock("@linear/sdk", () => {
    return {
        LinearClient: class {
            issues = mockLinearIssues;
            updateIssue = mockLinearUpdateIssue;
            createIssue = mockLinearCreateIssue;
            createComment = mockLinearCreateComment;
            issueLabels = mockLinearIssueLabels;
            createIssueLabel = mockLinearCreateIssueLabel;
            project = mockLinearProject;
        }
    };
});

// Mock EpisodicMemory
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            async init() { return mockInit(); }
            async store(...args: any[]) { return mockStore(...args); }
            async recall(...args: any[]) { return mockRecall(...args); }
        }
    }
});

// Mock Server
const mockServer = {
    tool: vi.fn()
};

describe("Project Delivery Validation", () => {
    let trackTool: any;
    let reportTool: any;
    let escalateTool: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGitCheckIsRepo.mockResolvedValue(true);
        process.env.LINEAR_API_KEY = "mock_linear_key";
        process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/mock";

        // Register tools to capture their implementation
        registerProjectDeliveryTools(mockServer as any);

        // Extract tool implementations
        const calls = (mockServer.tool as any).mock.calls;
        trackTool = calls.find((c: any) => c[0] === "track_milestone_progress")?.[3];
        reportTool = calls.find((c: any) => c[0] === "generate_client_report")?.[3];
        escalateTool = calls.find((c: any) => c[0] === "escalate_blockers")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should track milestone progress and log to Brain", async () => {
        // Setup Linear Mock
        // We need to support the filter logic in the tool which now fetches all issues and filters in memory
        // The mock needs to return issues that we can filter.
        const mockLabels = vi.fn().mockResolvedValue({ nodes: [] });
        mockLinearIssues.mockResolvedValue({
            nodes: [
                {
                    id: "1",
                    title: "Sprint 1: Task A",
                    state: { type: "completed" },
                    labels: mockLabels,
                    cycle: Promise.resolve({ name: "Sprint 1" })
                },
                {
                    id: "2",
                    title: "Sprint 1: Task B",
                    state: { type: "started" },
                    labels: mockLabels,
                    cycle: Promise.resolve({ name: "Sprint 1" })
                },
                {
                    id: "3",
                    title: "Other Task",
                    state: { type: "unstarted" },
                    labels: mockLabels,
                    cycle: Promise.resolve(null)
                }
            ]
        });

        const result = await trackTool({
            project_id: "proj_123",
            milestone_name: "Sprint 1"
        });

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe("success");
        // Should find 2 tasks matching "Sprint 1" in title
        // 1 completed out of 2 = 50%
        expect(content.data.completion_percentage).toBe(50);
        expect(content.data.total_issues).toBe(2);

        expect(mockInit).toHaveBeenCalled();
        expect(mockStore).toHaveBeenCalledWith(
            "track_milestone",
            expect.stringContaining("Progress Update: Milestone 'Sprint 1'"),
            expect.any(String), // JSON details
            [],
            undefined, undefined, false, undefined, undefined, 0, 0,
            "project_delivery"
        );
    });

    it("should generate client report, save to FS, commit to Git, and notify Slack", async () => {
        // Mock Linear Data
        mockLinearProject.mockResolvedValue({
            name: "Test Project",
            description: "A test project",
            issues: vi.fn().mockResolvedValue({
                nodes: [
                    { title: "Task A", state: { type: "completed", name: "Done" }, identifier: "TP-1" },
                    { title: "Task B", state: { type: "started", name: "In Progress" }, identifier: "TP-2" }
                ]
            })
        });

        // Mock Brain Recall
        mockRecall.mockResolvedValue([
            { userPrompt: "Update", agentResponse: "Completed feature X" }
        ]);

        // Mock Fetch (Slack & GitHub)
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([])
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await reportTool({
            project_id: "proj_123",
            period_start: "2023-01-01",
            period_end: "2023-01-07"
        });

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe("success");
        expect(content.data.report_path).toContain("reports/proj_123");

        // FS Write
        expect(mockWriteFile).toHaveBeenCalledWith(
            expect.stringContaining("report_2023-01-01_2023-01-07.md"),
            expect.stringContaining("# Client Report: Test Project")
        );

        // Git Commands (via simple-git)
        expect(mockGitCheckIsRepo).toHaveBeenCalled();
        expect(mockGitAdd).toHaveBeenCalledWith(expect.stringContaining("report_2023-01-01_2023-01-07.md"));
        expect(mockGitCommit).toHaveBeenCalledWith(expect.stringContaining("docs: client report for Test Project"));
        // mockGitPush might be called in try/catch

        // Slack Notification
        expect(mockFetch).toHaveBeenCalledWith(
            "https://hooks.slack.com/services/mock",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("should escalate blocked issues", async () => {
        // Mock Linear Data
        mockLinearProject.mockResolvedValue({
            issues: vi.fn().mockResolvedValue({
                nodes: [
                    {
                        id: "issue_blocked",
                        title: "Blocked Task",
                        identifier: "TP-3",
                        url: "https://linear.app/issue_blocked",
                        state: { name: "Blocked" },
                        labels: vi.fn().mockResolvedValue({ nodes: [] }), // No existing labels
                        team: Promise.resolve({ id: "team_1" })
                    },
                    {
                        id: "issue_normal",
                        title: "Normal Task",
                        state: { name: "In Progress" },
                        labels: vi.fn().mockResolvedValue({ nodes: [] })
                    }
                ]
            })
        });

        // Mock Create Label (if needed)
        mockLinearIssueLabels.mockResolvedValue({ nodes: [] }); // Label doesn't exist yet
        mockLinearCreateIssueLabel.mockResolvedValue({ issueLabel: Promise.resolve({ id: "label_escalated" }) });

        // Mock Fetch (Slack)
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal("fetch", mockFetch);

        const result = await escalateTool({
            project_id: "proj_123"
        });

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe("success");
        expect(content.data.escalated_issues).toContain("Blocked Task (TP-3)");

        // Linear Updates
        expect(mockLinearUpdateIssue).toHaveBeenCalledWith(
            "issue_blocked",
            expect.objectContaining({ labelIds: ["label_escalated"] })
        );

        expect(mockLinearCreateIssue).toHaveBeenCalledWith(expect.objectContaining({
            title: "Escalation: Blocked Task",
            priority: 1
        }));

        // Brain Log
        expect(mockStore).toHaveBeenCalledWith(
            "escalation_event",
            expect.stringContaining("Escalated issue TP-3"),
            expect.any(String),
            [],
            undefined, undefined, false, undefined, undefined, 0, 0,
            "project_delivery"
        );

        // Slack Notification
        expect(mockFetch).toHaveBeenCalledWith(
            "https://hooks.slack.com/services/mock",
            expect.objectContaining({ method: "POST" })
        );
    });
});
