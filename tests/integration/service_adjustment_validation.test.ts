import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerServiceAdjustmentTools } from '../../src/mcp_servers/business_ops/tools/service_adjustment.js';

// Mock dependencies
vi.mock('../../src/mcp_servers/business_ops/tools/performance_analytics.js', () => ({
    collectPerformanceMetrics: vi.fn().mockResolvedValue({
        period: "last_30_days",
        financial: { revenue: 100000, profit: 30000, margin: 0.3, outstanding: 5000 },
        delivery: { velocity: 50, cycleTime: 4.5, efficiency: 0.85, openIssues: 10, completedIssues: 50 },
        client: { nps: 80, churnRate: 0.02, activeClients: 12, satisfactionScore: 90 },
        timestamp: new Date().toISOString()
    })
}));

vi.mock('../../src/mcp_servers/business_ops/tools/pricing_optimization.js', () => ({
    generatePricingRecommendations: vi.fn().mockResolvedValue([
        {
            service_name: "Basic Audit",
            current_price: 1500,
            recommended_price: 1750,
            confidence_score: 0.85,
            reasoning: "Market demand is high."
        }
    ])
}));

vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    getMarketData: vi.fn().mockReturnValue({
        sector: "Software Development",
        region: "US",
        market_growth_rate: "12%",
        key_trends: ["AI", "Security"],
        competitor_density: "High"
    })
}));

// Mock LLM
vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn().mockReturnValue({
        generate: vi.fn().mockResolvedValue({
            message: JSON.stringify([
                {
                    name: "AI Security Audit",
                    target_client_segment: "Fintech",
                    estimated_price_range: "$5000-$8000",
                    margin_projection: "65%",
                    required_skills: ["Security", "AI"],
                    value_proposition: "Ensure AI models are secure.",
                    implementation_complexity: "Medium"
                }
            ])
        })
    })
}));

// Mock Brain
const mockStore = vi.fn().mockResolvedValue(true);
const mockRecall = vi.fn().mockResolvedValue([]);
vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        store: mockStore,
        recall: mockRecall
    }))
}));

describe('Service Adjustment Tool', () => {
    let server: McpServer;
    let toolHandler: Function;

    beforeEach(() => {
        server = new McpServer({ name: 'test', version: '1.0.0' });
        // Spy on tool registration to capture handler
        const toolSpy = vi.spyOn(server, 'tool');
        registerServiceAdjustmentTools(server);

        // Extract handler
        const call = toolSpy.mock.calls.find(c => c[0] === 'adjust_service_offerings');
        if (call) {
            toolHandler = call[3]; // handler is the 4th argument
        }

        vi.clearAllMocks();
        mockRecall.mockResolvedValue([]); // Reset recall to empty
    });

    it('should be registered', () => {
        expect(toolHandler).toBeDefined();
    });

    it('should generate service recommendations', async () => {
        const result = await toolHandler({
            current_services: [{ name: "Basic Audit", current_price: 1500 }],
            market_focus: "Fintech"
        });

        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveLength(1);
        expect(content[0].name).toBe("AI Security Audit");
        expect(content[0].margin_projection).toBe("65%");

        // Verify Brain storage
        expect(mockStore).toHaveBeenCalledWith(
            expect.stringContaining("service_adjustment_"),
            "Service Bundle Recommendations",
            expect.any(String),
            expect.arrayContaining(["service_adjustment"]),
            undefined, undefined, false, undefined, undefined, 0, 0,
            "service_recommendation"
        );
    });

    it('should be idempotent (not run if recently executed)', async () => {
        // Simulate recent run
        mockRecall.mockResolvedValue([{
            timestamp: new Date().toISOString(),
            agentResponse: "Previous recommendation"
        }]);

        const result = await toolHandler({
            current_services: [{ name: "Basic Audit", current_price: 1500 }]
        });

        expect(result.content[0].text).toContain("Service adjustment analysis already run recently");
        expect(mockStore).not.toHaveBeenCalled();
    });
});
