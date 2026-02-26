import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerPredictiveHealthTools } from "../../src/mcp_servers/business_ops/tools/predictive_health.js";

// Mock Dependencies
const mockLinearClient = {
    project: vi.fn(),
    createIssue: vi.fn()
};

const mockHubSpotClient = {
    crm: {
        contacts: {
            searchApi: { doSearch: vi.fn() }
        },
        objects: {
            notes: {
                basicApi: { create: vi.fn() }
            }
        }
    }
};

const mockEpisodicMemory = {
    init: vi.fn(),
    recall: vi.fn(),
    store: vi.fn()
};

// Hoist mocks
vi.mock("@linear/sdk", () => {
    return {
        LinearClient: vi.fn(() => mockLinearClient)
    };
});

vi.mock("@hubspot/api-client", () => {
    return {
        Client: vi.fn(() => mockHubSpotClient)
    };
});

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn(() => mockEpisodicMemory)
    };
});

describe("Predictive Client Health Validation", () => {
    let analyzeTool: any;
    let predictTool: any;
    let interveneTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LINEAR_API_KEY = "mock_linear";
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hubspot";
        process.env.LINEAR_TEAM_ID = "team_123";

        // Register tools
        registerPredictiveHealthTools(mockServer as any);

        // Extract tools
        const calls = (mockServer.tool as any).mock.calls;
        analyzeTool = calls.find((c: any) => c[0] === "analyze_client_health")?.[3];
        predictTool = calls.find((c: any) => c[0] === "predict_retention_risk")?.[3];
        interveneTool = calls.find((c: any) => c[0] === "trigger_preemptive_intervention")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should analyze a healthy client correctly", async () => {
        // Mock Linear Data (Healthy)
        const mockIssues = {
            nodes: [
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), priority: 0, labels: () => Promise.resolve({ nodes: [] }), createdAt: new Date(Date.now() - 86400000) },
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), priority: 0, labels: () => Promise.resolve({ nodes: [] }), createdAt: new Date(Date.now() - 86400000) },
            ]
        };
        mockLinearClient.project.mockResolvedValue({ issues: () => Promise.resolve(mockIssues) });

        // Mock HubSpot Data (Healthy)
        mockHubSpotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
            results: [{ id: "contact_1", updatedAt: new Date().toISOString() }]
        });

        // Mock Brain Data (Healthy)
        mockEpisodicMemory.recall.mockResolvedValue([]);

        const result = await analyzeTool({
            clientId: "Healthy Corp",
            linearProjectId: "proj_healthy",
            contactEmail: "healthy@example.com"
        });

        const report = JSON.parse(result.content[0].text);
        expect(report.linearMetrics.velocity).toBe(2);
        expect(report.linearMetrics.blockers).toBe(0);
        expect(report.crmSentiment.lastContactDays).toBeLessThanOrEqual(1);
        expect(report.brainMemories.sentimentSummary).not.toContain("Negative");
    });

    it("should predict high risk for an at-risk client", async () => {
        // Mock Linear Data (At Risk: Stalled, Blockers)
        const mockIssues = {
            nodes: [
                { state: Promise.resolve({ type: "started" }), priority: 1, labels: () => Promise.resolve({ nodes: [] }) }, // Blocker (Priority 1)
                { state: Promise.resolve({ type: "backlog" }), priority: 2, labels: () => Promise.resolve({ nodes: [{ name: "Blocker" }] }) }, // Blocker (Label)
                { state: Promise.resolve({ type: "backlog" }), priority: 1, labels: () => Promise.resolve({ nodes: [] }) }, // Blocker (Priority 1)
                { state: Promise.resolve({ type: "backlog" }), priority: 0, labels: () => Promise.resolve({ nodes: [] }) }
            ]
        };
        mockLinearClient.project.mockResolvedValue({ issues: () => Promise.resolve(mockIssues) });

        // Mock HubSpot Data (At Risk: No recent contact)
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 20);
        mockHubSpotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
            results: [{ id: "contact_risk", updatedAt: oldDate.toISOString() }]
        });

        // Mock Brain Data (At Risk: Negative feedback)
        mockEpisodicMemory.recall.mockResolvedValue([
            { userPrompt: "Client is angry about delays", agentResponse: "Noted" }
        ]);

        // 1. Analyze
        const analyzeResult = await analyzeTool({
            clientId: "Risk Corp",
            linearProjectId: "proj_risk",
            contactEmail: "risk@example.com"
        });
        const report = analyzeResult.content[0].text;

        // 2. Predict
        const predictResult = await predictTool({ healthReport: report });
        const assessment = JSON.parse(predictResult.content[0].text);

        expect(assessment.riskScore).toBeGreaterThan(70); // 30 (Velocity) + 25 (Blockers) + 15 (Engagement) + 20 (Sentiment) = 90
        expect(assessment.riskLevel).toBe("Critical");
        expect(assessment.factors).toContain("Stalled Velocity");
        expect(assessment.factors).toContain("Multiple Blockers Detected");
    });

    it("should trigger interventions for high-risk clients", async () => {
        // Mock Linear Issue Creation
        mockLinearClient.createIssue.mockResolvedValue({ success: true, issue: Promise.resolve({ id: "issue_esc" }) });
        mockLinearClient.project.mockResolvedValue({
             teams: () => Promise.resolve({ nodes: [{ id: "team_1" }] })
        });

        // Mock HubSpot Note
        mockHubSpotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
            results: [{ id: "contact_risk" }]
        });
        mockHubSpotClient.crm.objects.notes.basicApi.create.mockResolvedValue({ id: "note_1" });

        const result = await interveneTool({
            clientId: "Risk Corp",
            riskScore: 85,
            reason: "Critical Failure",
            linearProjectId: "proj_risk",
            contactEmail: "risk@example.com"
        });

        const output = result.content[0].text;
        expect(output).toContain("Created High-Priority Linear Issue");
        expect(output).toContain("Logged Intervention Note in HubSpot");

        expect(mockLinearClient.createIssue).toHaveBeenCalledWith(expect.objectContaining({
            priority: 1,
            title: expect.stringContaining("RISK INTERVENTION")
        }));

        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            "intervention_log",
            expect.stringContaining("Risk Corp"),
            expect.any(String),
            [],
            undefined,
            undefined,
            false,
            undefined,
            undefined,
            0,
            0,
            "intervention"
        );
    });
});
