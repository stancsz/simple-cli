import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEnhancedLeadGenerationTools } from '../../src/mcp_servers/business_ops/tools/enhanced_lead_generation.js';

// Define mocks before mocking
const mocks = vi.hoisted(() => ({
    mockStore: vi.fn(),
    mockInit: vi.fn(),
    mockGenerate: vi.fn(),
    mockSyncContact: vi.fn(),
    mockSyncCompany: vi.fn(),
    mockGetGrowthTargets: vi.fn(),
    mockGetMarketData: vi.fn(),
    mockAnalyzeCompetitorPricing: vi.fn()
}));

// 1. Mock LLM
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockGenerate
    })
}));

// 2. Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            init: mocks.mockInit,
            store: mocks.mockStore,
            recall: vi.fn()
        }))
    };
});

// 3. Mock HubSpot CRM functions
vi.mock('../../src/mcp_servers/business_ops/crm.js', () => ({
    syncContactToHubSpot: mocks.mockSyncContact,
    syncCompanyToHubSpot: mocks.mockSyncCompany
}));

// 4. Mock Market Data
vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    getMarketData: mocks.mockGetMarketData,
    analyzeCompetitorPricingInternal: mocks.mockAnalyzeCompetitorPricing
}));

// 5. Mock getGrowthTargets (from Brain)
vi.mock('../../src/mcp_servers/brain/tools/strategic_growth.js', () => ({
    getGrowthTargets: mocks.mockGetGrowthTargets
}));


describe('Strategic Lead Generation (Phase 26)', () => {
    let server: McpServer;
    let discoverStrategicLeads: Function;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup MCP Server
        server = new McpServer({ name: 'test_ops', version: '1.0.0' });

        // Capture registered tool function
        const originalTool = server.tool.bind(server);
        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (name === 'discover_strategic_leads') {
                discoverStrategicLeads = func;
            }
            return originalTool(name, desc, schema, func);
        });

        registerEnhancedLeadGenerationTools(server);
    });

    it('should query strategy, synthesize leads, store in brain, and sync to HubSpot', async () => {
        // Setup Mocks for successful run

        // Mock Brain's getGrowthTargets
        mocks.mockGetGrowthTargets.mockResolvedValue({
            target_markets: ["HealthTech", "FinTech"],
            icp_attributes: {
                industry: "Healthcare Software",
                company_size: "50-200"
            },
            strategic_goals: ["Increase ARR by 20%"]
        });

        // Mock Market Data
        mocks.mockGetMarketData.mockResolvedValue({
            sector: "HealthTech",
            demand_score: 90
        });

        // Mock Competitor Pricing
        mocks.mockAnalyzeCompetitorPricing.mockResolvedValue([
            {
                url: "https://mock-healthtech-competitor.com",
                pricing_model: "Subscription",
                extracted_offerings: []
            }
        ]);

        // Mock LLM Response with proper JSON
        const mockLeads = {
            leads: [
                {
                    company_name: "HealthInnovate",
                    company_domain: "healthinnovate.com",
                    contact_email: "ceo@healthinnovate.com",
                    contact_name: "Alice Smith",
                    strategic_fit_score: 95,
                    rationale: "Matches HealthTech and 50-200 size."
                },
                {
                    company_name: "FinSecure",
                    company_domain: "finsecure.io",
                    contact_email: "founder@finsecure.io",
                    contact_name: "Bob Jones",
                    strategic_fit_score: 70, // Below 80 threshold for CRM sync
                    rationale: "Matches FinTech target."
                }
            ]
        };

        mocks.mockGenerate.mockResolvedValue({
            message: JSON.stringify(mockLeads),
            thought: "Synthesizing leads based on strategy."
        });

        // Mock HubSpot Sync
        mocks.mockSyncCompany.mockResolvedValue({ id: "company_123", action: "created" });
        mocks.mockSyncContact.mockResolvedValue({ id: "contact_123", action: "created" });
        mocks.mockStore.mockResolvedValue(undefined);

        // Execute Tool
        const result = await discoverStrategicLeads({ company: "test_co" });

        // Assertions
        expect(result.isError).toBeUndefined();

        const contentStr = result.content[0].text;
        expect(contentStr).toContain('HealthInnovate');
        expect(contentStr).toContain('FinSecure');

        // Verify Growth Targets were requested
        expect(mocks.mockGetGrowthTargets).toHaveBeenCalled();

        // Verify Market Data was collected for target markets
        expect(mocks.mockGetMarketData).toHaveBeenCalledWith('HealthTech', 'Global');
        expect(mocks.mockGetMarketData).toHaveBeenCalledWith('FinTech', 'Global');

        // Verify Competitor Pricing was collected
        expect(mocks.mockAnalyzeCompetitorPricing).toHaveBeenCalledWith(['https://mock-healthtech-competitor.com']);
        expect(mocks.mockAnalyzeCompetitorPricing).toHaveBeenCalledWith(['https://mock-fintech-competitor.com']);

        // Verify LLM Synthesis
        expect(mocks.mockGenerate).toHaveBeenCalled();
        const llmPrompt = mocks.mockGenerate.mock.calls[0][0];
        expect(llmPrompt).toContain("HealthTech");
        expect(llmPrompt).toContain("FinTech");

        // Verify Episodic Memory Storage (for both leads)
        expect(mocks.mockStore).toHaveBeenCalledTimes(2);
        const storeArgs1 = mocks.mockStore.mock.calls[0];
        expect(storeArgs1[0]).toMatch(/strategic_lead_\d+_\d+/);
        expect(storeArgs1[1]).toBe("Strategic lead discovery");
        expect(storeArgs1[3]).toEqual(["lead_generation", "strategic_growth"]);
        expect(storeArgs1[4]).toBe("test_co");
        expect(storeArgs1[11]).toBe("strategic_lead");

        // Verify HubSpot Sync (only HealthInnovate score >= 80)
        expect(mocks.mockSyncCompany).toHaveBeenCalledTimes(1);
        expect(mocks.mockSyncCompany).toHaveBeenCalledWith({
            name: "HealthInnovate",
            domain: "healthinnovate.com",
            industry: "Healthcare Software"
        });

        expect(mocks.mockSyncContact).toHaveBeenCalledTimes(1);
        expect(mocks.mockSyncContact).toHaveBeenCalledWith({
            email: "ceo@healthinnovate.com",
            firstname: "Alice",
            lastname: "Smith",
            company: "HealthInnovate",
            lifecyclestage: "lead"
        });
    });

    it('should handle cases with no strategy found gracefully', async () => {
        // Mock getGrowthTargets to throw or return empty
        mocks.mockGetGrowthTargets.mockRejectedValue(new Error("No corporate strategy found"));

        const result = await discoverStrategicLeads({ company: "test_co" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("No corporate strategy found");

        expect(mocks.mockGetMarketData).not.toHaveBeenCalled();
        expect(mocks.mockGenerate).not.toHaveBeenCalled();
    });
});
