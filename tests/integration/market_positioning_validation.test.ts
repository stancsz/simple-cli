import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketPositioningTools } from '../../src/mcp_servers/business_ops/tools/market_positioning.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// Setup Mocks via vi.hoisted
const mocks = vi.hoisted(() => ({
    mockLlmGenerate: vi.fn(),
    mockLlmEmbed: vi.fn(),
    mockAnalyzeCompetitorPricingInternal: vi.fn(),
    mockGetMarketData: vi.fn(),
    mockUpdateOperatingPolicyLogic: vi.fn(),
    mockServerTool: vi.fn()
}));

// Mock LLM
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockLlmGenerate,
        embed: mocks.mockLlmEmbed
    })
}));

// Mock market_analysis internal functions so we don't fetch real URLs
vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    analyzeCompetitorPricingInternal: mocks.mockAnalyzeCompetitorPricingInternal,
    getMarketData: mocks.mockGetMarketData
}));

describe('Market Positioning Automation Validation', () => {
    let mockServer: any;
    let episodic: EpisodicMemory;
    const testDir = path.join(process.cwd(), '.agent', 'brain', 'test_market_positioning');

    beforeEach(async () => {
        vi.clearAllMocks();
        // Setup mock LLM embed to return fake vector
        mocks.mockLlmEmbed.mockResolvedValue(new Array(1536).fill(0.1));

        // Setup real EpisodicMemory in a temporary test directory
        process.env.JULES_AGENT_DIR = path.join(process.cwd(), '.agent');
        episodic = new EpisodicMemory(process.cwd());
        await episodic.init();

        mockServer = {
            tool: mocks.mockServerTool
        };
        registerMarketPositioningTools(mockServer as any);
    });

    afterEach(() => {
        // Cleanup test database
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should successfully analyze the competitive landscape', async () => {
        // Setup mock data from external sources
        mocks.mockGetMarketData.mockResolvedValue({
            sector: "Software Development",
            region: "Global",
            average_hourly_rates: { junior: 50, senior: 100, expert: 200 }
        });

        mocks.mockAnalyzeCompetitorPricingInternal.mockResolvedValue([
            {
                url: "http://example.com",
                pricing_model: "Subscription",
                extracted_offerings: [{ plan: "Pro", price: 99, period: "month", features: ["A"] }]
            }
        ]);

        // Setup LLM mock response for the synthesis
        mocks.mockLlmGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                market_overview: "Market is growing.",
                competitor_summary: "Competitors are cheaper.",
                identified_gaps: ["Lack of premium AI integrations"],
                opportunities: ["Premium positioning"],
                threats: ["Price wars"]
            })
        });

        const toolHandler = mocks.mockServerTool.mock.calls.find((call: any[]) => call[0] === 'analyze_competitive_landscape')[3];

        const result = await toolHandler({
            sector: "Software Development",
            region: "Global",
            competitor_urls: ["http://example.com"],
            force_refresh: true
        });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.identified_gaps).toContain("Lack of premium AI integrations");
        expect(mocks.mockGetMarketData).toHaveBeenCalledWith("Software Development", "Global");
        expect(mocks.mockAnalyzeCompetitorPricingInternal).toHaveBeenCalledWith(["http://example.com"], true);
    });

    it('should propose a positioning adjustment and update the policy when auto_update_policy is true and confidence is high', async () => {
        // Store a real CorporateStrategy in episodic memory
        const testCompany = "test_market_positioning";
        const initialStrategy = {
            vision: "Be the leading AI agency",
            objectives: ["Increase revenue"],
            policies: {},
            timestamp: Date.now()
        };
        await episodic.store(
            `strategy_${randomUUID()}`,
            "Define corporate strategy",
            JSON.stringify(initialStrategy),
            [],
            testCompany,
            undefined,
            undefined,
            undefined,
            undefined,
            0,
            0,
            "CorporateStrategy"
        );

        // Mock LLM generation for positioning proposal
        mocks.mockLlmGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendations: ["Shift towards high-end enterprise AI consulting"],
                rationale: "Competitors are undercutting the lower end of the market.",
                high_confidence: true,
                proposed_policy_changes: {
                    min_margin: 0.35,
                    risk_tolerance: "high"
                }
            })
        });

        const toolHandler = mocks.mockServerTool.mock.calls.find((call: any[]) => call[0] === 'propose_positioning_adjustment')[3];

        const result = await toolHandler({
            competitive_analysis: '{"gaps": ["enterprise AI"]}',
            company: testCompany,
            auto_update_policy: true
        });

        expect(result.content).toBeDefined();
        const parsedContent = JSON.parse(result.content[0].text);

        // Check proposal details
        expect(parsedContent.proposal.high_confidence).toBe(true);
        expect(parsedContent.proposal.proposed_policy_changes.min_margin).toBe(0.35);

        // Verify policy update occurred in the response
        expect(parsedContent.policy_update.status).toBe("success");
        expect(parsedContent.policy_update.policy.parameters.min_margin).toBe(0.35);
        expect(parsedContent.policy_update.policy.parameters.risk_tolerance).toBe("high");

        // Verify the policy is actually stored in real EpisodicMemory
        const savedPolicies = await episodic.recall("corporate_policy", 10, testCompany, "corporate_policy");
        expect(savedPolicies.length).toBeGreaterThan(0);

        const latestPolicy = JSON.parse(savedPolicies[0].agentResponse);
        expect(latestPolicy.parameters.min_margin).toBe(0.35);
        expect(latestPolicy.parameters.risk_tolerance).toBe("high");
        expect(latestPolicy.isActive).toBe(true);
    });

    it('should propose adjustment but not update policy if auto_update_policy is false', async () => {
        const testCompany = "test_market_positioning_2";

        mocks.mockLlmGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendations: ["Minor messaging tweak"],
                rationale: "Not enough data",
                high_confidence: false,
                proposed_policy_changes: {
                    min_margin: 0.25,
                    risk_tolerance: "medium"
                }
            })
        });

        const toolHandler = mocks.mockServerTool.mock.calls.find((call: any[]) => call[0] === 'propose_positioning_adjustment')[3];

        const result = await toolHandler({
            competitive_analysis: '{"gaps": []}',
            company: testCompany,
            auto_update_policy: false
        });

        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.policy_update).toBe("No automatic policy update performed.");

        // Ensure no policy was stored in memory
        const savedPolicies = await episodic.recall("corporate_policy", 10, testCompany, "corporate_policy");
        expect(savedPolicies.length).toBe(0);
    });
});
