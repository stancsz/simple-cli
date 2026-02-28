import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketPositioningTools } from '../../src/mcp_servers/business_ops/tools/market_positioning.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';

// Setup Mock Data
const mockStrategy = {
    vision: "Become the leading AI-driven agency for tech startups",
    objectives: ["HealthTech sector", "Increase MRR by 20%"],
    policies: {},
    timestamp: Date.now()
};

const mockMarketData = {
    sector: "HealthTech",
    region: "Global",
    timestamp: new Date().toISOString(),
    market_growth_rate: "15%",
    average_hourly_rates: {
        senior: { min: 120, max: 180, currency: "USD" }
    },
    key_trends: ["AI diagnostic tools", "HIPAA compliance automation"],
    competitor_density: "Medium",
    demand_score: 90
};

const mockCompetitorData = [
    {
        url: "https://example-competitor.com",
        pricing_model: "Tiered",
        extracted_offerings: [
            { plan: "Basic", price: 5000, period: "month", features: ["Standard compliance"] }
        ],
        value_proposition: "Affordable HealthTech compliance",
        strengths: ["Low price"],
        weaknesses: ["Slow turnaround"],
        target_audience: "Small clinics"
    }
];

// Provide mock LLM responses
const mockLlmResponseAnalysis = JSON.stringify({
    analysis: {
        gaps: ["No explicit HIPAA compliance service mentioned currently"],
        opportunities: ["High demand for HIPAA compliance automation", "Target small clinics with a fast-turnaround tier"],
        threats: ["Competitors offering low prices for standard compliance"]
    },
    recommendations: [
        {
            type: "messaging_pivot",
            description: "Pivot messaging to emphasize HIPAA compliance for HealthTech clients",
            actionable_steps: ["Update website copy", "Launch targeted email campaign"]
        },
        {
            type: "new_tier",
            description: "Introduce a fast-turnaround compliance tier",
            actionable_steps: ["Define service SLA", "Set pricing at 20% premium over competitor Basic tier"]
        }
    ],
    confidence_score: 0.9,
    proposed_pivot_statement: "Pivot our primary value proposition to focus on rapid, AI-driven HIPAA compliance solutions for HealthTech startups."
});

// Hoist mocks
const mocks = vi.hoisted(() => ({
    mockGenerate: vi.fn(),
    mockReadStrategy: vi.fn(),
    mockProposeStrategicPivot: vi.fn(),
    mockGetMarketData: vi.fn(),
    mockAnalyzeCompetitorPricingInternal: vi.fn(),
    mockStore: vi.fn(),
    mockRecall: vi.fn()
}));

// Setup Vitest Mocks
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockGenerate
    })
}));

vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        store: mocks.mockStore,
        recall: mocks.mockRecall
    }))
}));

vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    readStrategy: mocks.mockReadStrategy,
    proposeStrategicPivot: mocks.mockProposeStrategicPivot
}));

vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    getMarketData: mocks.mockGetMarketData,
    analyzeCompetitorPricingInternal: mocks.mockAnalyzeCompetitorPricingInternal
}));

describe('Market Positioning Automation Validation', () => {
    let analyzeTool: any;
    let mockServer: any = {
        tool: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();

        registerMarketPositioningTools(mockServer);

        // Extract tool implementation
        const calls = mockServer.tool.mock.calls;
        analyzeTool = calls.find((c: any) => c[0] === "analyze_and_adjust_positioning")?.[3];

        // Default mock behaviors
        mocks.mockReadStrategy.mockResolvedValue(mockStrategy);
        mocks.mockGetMarketData.mockResolvedValue(mockMarketData);
        mocks.mockAnalyzeCompetitorPricingInternal.mockResolvedValue(mockCompetitorData);

        mocks.mockGenerate.mockResolvedValue({ message: mockLlmResponseAnalysis });

        mocks.mockProposeStrategicPivot.mockResolvedValue({
            ...mockStrategy,
            vision: "Updated vision with HealthTech focus",
            timestamp: Date.now()
        });
    });

    it('should successfully analyze positioning and return a structured report', async () => {
        expect(analyzeTool).toBeDefined();

        // Execute tool without auto-pivot
        const result = await analyzeTool({ company: "test_corp", auto_pivot: false, competitor_urls: ["https://example-competitor.com"] });

        // Verify dependencies were called
        expect(mocks.mockReadStrategy).toHaveBeenCalledWith(expect.any(Object), "test_corp");
        expect(mocks.mockGetMarketData).toHaveBeenCalledWith("HealthTech", "Global");
        expect(mocks.mockAnalyzeCompetitorPricingInternal).toHaveBeenCalledWith(["https://example-competitor.com"], false);

        expect(mocks.mockGenerate).toHaveBeenCalledTimes(1);
        expect(mocks.mockGenerate.mock.calls[0][0]).toContain("=== Current Corporate Strategy ===");
        expect(mocks.mockGenerate.mock.calls[0][0]).toContain("HealthTech");

        expect(mocks.mockStore).toHaveBeenCalledTimes(1);
        expect(mocks.mockStore.mock.calls[0][1]).toBe("Positioning Analysis against Strategy");

        // Verify auto_pivot was NOT executed
        expect(mocks.mockProposeStrategicPivot).not.toHaveBeenCalled();

        // Verify output
        expect(result.isError).toBeFalsy();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Market Positioning Analysis Report");
        expect(result.content[0].text).toContain("HIPAA compliance");
        expect(result.content[0].text).not.toContain("Auto-Pivot Skipped"); // Since auto_pivot is false, no message is added.
    });

    it('should automatically execute a strategic pivot if confidence is high and auto_pivot is true', async () => {
        const result = await analyzeTool({ company: "test_corp", auto_pivot: true });

        // Verify auto_pivot was executed
        expect(mocks.mockProposeStrategicPivot).toHaveBeenCalledTimes(1);
        expect(mocks.mockProposeStrategicPivot).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            "Pivot our primary value proposition to focus on rapid, AI-driven HIPAA compliance solutions for HealthTech startups.",
            "test_corp"
        );

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("[Auto-Pivot Executed]");
        expect(result.content[0].text).toContain("Updated vision with HealthTech focus");
    });

    it('should not automatically execute a pivot if confidence is below threshold', async () => {
        // Lower confidence score
        const lowConfidenceAnalysis = JSON.parse(mockLlmResponseAnalysis);
        lowConfidenceAnalysis.confidence_score = 0.5;
        mocks.mockGenerate.mockResolvedValueOnce({ message: JSON.stringify(lowConfidenceAnalysis) });

        const result = await analyzeTool({ company: "test_corp", auto_pivot: true });

        // Verify auto_pivot was NOT executed
        expect(mocks.mockProposeStrategicPivot).not.toHaveBeenCalled();

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("[Auto-Pivot Skipped]");
        expect(result.content[0].text).toContain("0.5");
    });

    it('should return an error if no corporate strategy is found', async () => {
        mocks.mockReadStrategy.mockResolvedValueOnce(null);

        const result = await analyzeTool({ company: "test_corp" });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toContain("No corporate strategy found");
        expect(mocks.mockGenerate).not.toHaveBeenCalled();
    });
});
