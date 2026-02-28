import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketPositioningTools } from '../../src/mcp_servers/business_ops/tools/market_positioning.js';
import * as marketAnalysis from '../../src/mcp_servers/business_ops/tools/market_analysis.js';
import * as strategy from '../../src/mcp_servers/brain/tools/strategy.js';
import { CorporatePolicy } from '../../src/brain/schemas.js';

const mocks = vi.hoisted(() => ({
    mockGenerate: vi.fn(),
    mockInit: vi.fn(),
    mockRecall: vi.fn(),
    mockStore: vi.fn(),
    mockGetMarketData: vi.fn(),
    mockAnalyzeCompetitorPricingInternal: vi.fn(),
    mockGetLatestStrategy: vi.fn()
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockGenerate
    })
}));

vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn().mockImplementation(() => ({
        init: mocks.mockInit,
        recall: mocks.mockRecall,
        store: mocks.mockStore
    }))
}));

// Mock the dependencies correctly using vi.spyOn in beforeEach or vi.mock
vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    getMarketData: mocks.mockGetMarketData,
    analyzeCompetitorPricingInternal: mocks.mockAnalyzeCompetitorPricingInternal,
    registerMarketAnalysisTools: vi.fn()
}));

vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    getLatestStrategy: mocks.mockGetLatestStrategy,
    registerStrategyTools: vi.fn()
}));

describe('Market Positioning Validation', () => {
    let mockServer: any;
    let tools: Record<string, Function> = {};

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            tool: vi.fn().mockImplementation((name, desc, schema, handler) => {
                tools[name] = handler;
            })
        };

        registerMarketPositioningTools(mockServer);

        mocks.mockGetMarketData.mockResolvedValue({
            sector: 'AI Agents',
            region: 'Global',
            market_growth_rate: '25%',
            key_trends: ['Autonomous Workflows']
        });

        mocks.mockAnalyzeCompetitorPricingInternal.mockResolvedValue([
            {
                url: 'https://competitor.com',
                pricing_model: 'SaaS',
                value_proposition: 'AI tools for HR'
            }
        ]);

        mocks.mockGetLatestStrategy.mockResolvedValue({
            vision: 'Lead the AI Agency market',
            strategic_pillars: ['Innovation', 'Efficiency']
        });
    });

    it('should run analyze_competitive_landscape and synthesize data correctly', async () => {
        const handler = tools['analyze_competitive_landscape'];
        expect(handler).toBeDefined();

        mocks.mockGenerate.mockResolvedValue({
            message: JSON.stringify({
                market_gaps: ['Lack of autonomous agent solutions'],
                competitive_threats: ['Established SaaS adding AI features'],
                recommended_focus_areas: ['End-to-end automation'],
                blue_ocean_opportunities: ['Fully autonomous corporate consciousness'],
                overall_assessment: 'Strong opportunity to pivot to full autonomy.'
            })
        });

        const result = await handler({
            competitor_urls: ['https://competitor.com'],
            sector: 'AI Agents',
            region: 'Global',
            company: 'test-co'
        });

        expect(mocks.mockGetMarketData).toHaveBeenCalledWith('AI Agents', 'Global');
        expect(mocks.mockAnalyzeCompetitorPricingInternal).toHaveBeenCalledWith(['https://competitor.com'], false);
        expect(mocks.mockGetLatestStrategy).toHaveBeenCalledWith('test-co');

        expect(mocks.mockGenerate).toHaveBeenCalled();
        const callArgs = mocks.mockGenerate.mock.calls[0][0];
        expect(callArgs).toContain('Act as a Chief Marketing Officer');
        expect(callArgs).toContain('AI tools for HR'); // from competitor

        expect(mocks.mockStore).toHaveBeenCalled();
        const storedTag = mocks.mockStore.mock.calls[0][3];
        expect(storedTag).toContain('market_positioning');

        const content = JSON.parse(result.content[0].text);
        expect(content.blue_ocean_opportunities).toContain('Fully autonomous corporate consciousness');
    });

    it('should propose_positioning_adjustment and route policy updates via memory', async () => {
        const handler = tools['propose_positioning_adjustment'];
        expect(handler).toBeDefined();

        mocks.mockRecall.mockImplementation(async (query: string, limit: number, company: string, type: string) => {
            if (type === 'competitive_landscape') {
                return [{
                    agentResponse: JSON.stringify({ overall_assessment: 'Need to pivot to autonomy.' })
                }];
            }
            if (type === 'corporate_policy') {
                const currentPolicy: CorporatePolicy = {
                    id: 'old-id',
                    version: 1,
                    name: 'Global Operating Policy',
                    description: 'Initial',
                    isActive: true,
                    timestamp: Date.now(),
                    author: 'Admin',
                    parameters: { min_margin: 0.2, risk_tolerance: 'medium', max_agents_per_swarm: 5 }
                };
                return [{
                    agentResponse: JSON.stringify(currentPolicy)
                }];
            }
            return [];
        });

        mocks.mockGenerate.mockResolvedValue({
            message: JSON.stringify({
                strategic_pivot_rationale: 'Shift to high-margin autonomous services.',
                updated_value_proposition: 'We build agents that build businesses.',
                target_audience_shift: 'Enterprise C-Suite',
                recommended_policy_updates: {
                    min_margin: 0.35,
                    risk_tolerance: 'high'
                },
                new_messaging_pillars: ['Autonomy', 'ROI']
            })
        });

        const result = await handler({
            current_positioning: 'We build simple automation scripts.',
            company: 'test-co'
        });

        expect(mocks.mockRecall).toHaveBeenCalledWith('competitive landscape', 1, 'test-co', 'competitive_landscape');
        expect(mocks.mockGetLatestStrategy).toHaveBeenCalledWith('test-co');

        expect(mocks.mockStore).toHaveBeenCalledTimes(2); // One for positioning update, one for policy update

        // Check policy update store
        const policyStoreCall = mocks.mockStore.mock.calls[1];
        expect(policyStoreCall[0]).toContain('policy_update_v2'); // ID
        expect(policyStoreCall[11]).toBe('corporate_policy'); // Type

        const storedPolicy = JSON.parse(policyStoreCall[2]);
        expect(storedPolicy.parameters.min_margin).toBe(0.35);
        expect(storedPolicy.parameters.risk_tolerance).toBe('high');
        expect(storedPolicy.version).toBe(2);

        const content = JSON.parse(result.content[0].text);
        expect(content.policy_routing_status).toBe('Policy updated successfully based on recommendations.');
        expect(content.updated_value_proposition).toBe('We build agents that build businesses.');
    });
});
