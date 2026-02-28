import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProposalGenerationTools } from '../../src/mcp_servers/business_ops/tools/proposal_generation.js';
import { registerContractNegotiationTools } from '../../src/mcp_servers/business_ops/tools/contract_negotiation.js';
import { registerEnhancedLeadGenerationTools } from '../../src/mcp_servers/business_ops/tools/enhanced_lead_generation.js';
import { registerRevenueMetricsTools } from '../../src/mcp_servers/business_ops/tools/revenue_metrics.js';
import * as fs from 'fs';
import * as path from 'path';

// Define mocks
const mocks = vi.hoisted(() => ({
    mockGenerate: vi.fn(),
    mockInit: vi.fn(),
    mockRecall: vi.fn(),
    mockStore: vi.fn(),
    mockReadStrategy: vi.fn(),
    mockSyncDeal: vi.fn(),
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockSyncContact: vi.fn(),
    mockSyncCompany: vi.fn(),
    mockGetGrowthTargets: vi.fn(),
    mockGetMarketData: vi.fn(),
    mockAnalyzeCompetitorPricing: vi.fn(),
    mockGetXeroClient: vi.fn(),
    mockGetTenantId: vi.fn()
}));

// Mock OpenCoworkServer
vi.mock('../../src/mcp_servers/opencowork/index.js', () => ({
    OpenCoworkServer: vi.fn().mockImplementation(() => ({
        hireWorker: vi.fn().mockResolvedValue({ content: [{ text: "Worker hired" }] }),
        delegateTask: vi.fn().mockResolvedValue({ content: [{ text: "I ACCEPT these terms." }] }) // Fast-track consensus
    }))
}));

// Mock LLM
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockGenerate
    })
}));

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn().mockImplementation(() => ({
        init: mocks.mockInit,
        recall: mocks.mockRecall,
        store: mocks.mockStore
    }))
}));

// Mock Strategy Tool
vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    readStrategy: mocks.mockReadStrategy
}));

// Mock CRM
vi.mock('../../src/mcp_servers/business_ops/crm.js', () => ({
    syncDealToHubSpot: mocks.mockSyncDeal,
    syncContactToHubSpot: mocks.mockSyncContact,
    syncCompanyToHubSpot: mocks.mockSyncCompany
}));

// Mock Market Data
vi.mock('../../src/mcp_servers/business_ops/tools/market_analysis.js', () => ({
    getMarketData: mocks.mockGetMarketData,
    analyzeCompetitorPricingInternal: mocks.mockAnalyzeCompetitorPricing
}));

// Mock getGrowthTargets (from Brain)
vi.mock('../../src/mcp_servers/brain/tools/strategic_growth.js', () => ({
    getGrowthTargets: mocks.mockGetGrowthTargets
}));

// Mock Xero Tools
vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => ({
    getXeroClient: mocks.mockGetXeroClient,
    getTenantId: mocks.mockGetTenantId
}));

// Mock FS
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: mocks.mockExistsSync,
        readFileSync: mocks.mockReadFileSync
    };
});

describe('Intelligent Proposal Generation & Negotiation (Phase 26)', () => {
    let server: McpServer;
    let generateClientProposal: Function;
    let simulateContractNegotiation: Function;
    let discoverStrategicLeads: Function;
    let trackRevenueGrowth: Function;

    beforeEach(() => {
        vi.clearAllMocks();

        server = new McpServer({ name: 'test_ops', version: '1.0.0' });

        const originalTool = server.tool.bind(server);
        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (name === 'generate_client_proposal') {
                generateClientProposal = func;
            } else if (name === 'simulate_contract_negotiation') {
                simulateContractNegotiation = func;
            } else if (name === 'discover_strategic_leads') {
                discoverStrategicLeads = func;
            } else if (name === 'track_revenue_growth') {
                trackRevenueGrowth = func;
            }
            return originalTool(name, desc, schema, func);
        });

        registerProposalGenerationTools(server);
        registerContractNegotiationTools(server);
        registerEnhancedLeadGenerationTools(server);
        registerRevenueMetricsTools(server);
    });


    it('should execute full Phase 26 growth loop: Lead Gen -> Proposal -> Negotiation', async () => {
        // --- STEP 1: LEAD GENERATION MOCKS ---

        mocks.mockGetGrowthTargets.mockResolvedValue({
            target_markets: ["HealthTech", "FinTech"],
            icp_attributes: {
                industry: "Healthcare Software",
                company_size: "50-200"
            },
            strategic_goals: ["Increase ARR by 20%"]
        });

        mocks.mockGetMarketData.mockResolvedValue({
            sector: "HealthTech",
            demand_score: 90
        });

        mocks.mockAnalyzeCompetitorPricing.mockResolvedValue([
            {
                url: "https://mock-healthtech-competitor.com",
                pricing_model: "Subscription",
                extracted_offerings: []
            }
        ]);

        // Mock LLM Response for Lead Generation
        const mockLeads = {
            leads: [
                {
                    company_name: "HealthInnovate",
                    company_domain: "healthinnovate.com",
                    contact_email: "ceo@healthinnovate.com",
                    contact_name: "Alice Smith",
                    strategic_fit_score: 95,
                    rationale: "Matches HealthTech and 50-200 size."
                }
            ]
        };

        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify(mockLeads),
            thought: "Synthesizing leads based on strategy."
        });

        mocks.mockSyncCompany.mockResolvedValue({ id: "company_123", action: "created" });
        mocks.mockSyncContact.mockResolvedValue({ id: "contact_123", action: "created" });
        mocks.mockStore.mockResolvedValue(undefined);

        // --- EXECUTE STEP 1: LEAD GENERATION ---
        const leadResult = await discoverStrategicLeads({ company: "test_co" });

        // Assertions for Step 1
        expect(leadResult.isError).toBeUndefined();
        const leadContentStr = leadResult.content[0].text;
        expect(leadContentStr).toContain('HealthInnovate');
        expect(mocks.mockGetGrowthTargets).toHaveBeenCalled();
        expect(mocks.mockSyncCompany).toHaveBeenCalledWith({
            name: "HealthInnovate",
            domain: "healthinnovate.com",
            industry: "Healthcare Software"
        });


        // --- STEP 2: PROPOSAL GENERATION MOCKS ---

        mocks.mockReadStrategy.mockResolvedValue({
            vision: "To be the leading autonomous AI agency.",
            objectives: ["Increase ARR", "Expand market share"]
        });

        mocks.mockRecall.mockImplementation(async (query: string) => {
            if (query === 'corporate_policy') {
                return [{
                    agentResponse: JSON.stringify({
                        version: 2,
                        isActive: true,
                        parameters: { min_margin: 0.3 }
                    })
                }];
            }
            return [
                { agentResponse: "Past Proposal 1" },
                { agentResponse: "Past Proposal 2" }
            ];
        });

        mocks.mockExistsSync.mockReturnValue(true);
        mocks.mockReadFileSync.mockReturnValue(`
# Project Proposal: {{COMPANY_NAME}}
## 1. Executive Summary
{{EXECUTIVE_SUMMARY}}
## 2. Proposed Solution & Scope
{{PROPOSED_SOLUTION}}
## 3. Timeline & Milestones
{{TIMELINE}}
## 4. Pricing & Terms
{{PRICING_TERMS}}
`);

        // First LLM call: Generate JSON values
        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                EXECUTIVE_SUMMARY: "This is a great executive summary.",
                PROPOSED_SOLUTION: "We will build a great product.",
                TIMELINE: "It will take 3 months.",
                PRICING_TERMS: "$50,000 based on standard rates."
            }),
            thought: "Generating proposal sections."
        });

        // Second LLM call: Supervisor Review
        const reviewedProposal = `
# Project Proposal: HealthInnovate
## 1. Executive Summary
This is a great executive summary for HealthInnovate.
## 2. Proposed Solution & Scope
We will build a great product.
## 3. Timeline & Milestones
It will take 3 months.
## 4. Pricing & Terms
$50,000 based on standard rates.
`;
        mocks.mockGenerate.mockResolvedValueOnce({
            message: reviewedProposal,
            thought: "Reviewed and looks good."
        });

        mocks.mockSyncDeal.mockResolvedValue({ id: 'deal_123', action: 'created' });

        // Setup LLM mock for the internal high-value negotiation synthesis step (triggered automatically)
        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                pre_approved_terms: "$50,000",
                simulated_concessions: "None",
                final_margin: 0.4,
                policy_compliance_status: "Compliant"
            })
        });

        // --- EXECUTE STEP 2: PROPOSAL GENERATION ---
        const proposalResult = await generateClientProposal({
            company_name: 'HealthInnovate',
            project_scope: 'Build a HealthTech AI agent',
            estimated_hours: 100 // At 100 hours * 150 * 1.3 = 19500 (deal amount > 10000 -> triggers negotiation)
        });

        // Assertions for Step 2
        expect(proposalResult.isError).toBeUndefined();
        const proposalContentStr = proposalResult.content[0].text;
        expect(proposalContentStr).toContain('Proposal generated successfully');
        expect(proposalContentStr).toContain('HealthInnovate');
        expect(mocks.mockReadStrategy).toHaveBeenCalled();
        expect(mocks.mockSyncDeal).toHaveBeenCalledWith(expect.objectContaining({
            dealname: 'Proposal: HealthInnovate - Build a HealthTech AI agent',
            dealstage: 'presentationscheduled'
        }));


        // --- STEP 3: CONTRACT NEGOTIATION MOCKS (Explicit simulation) ---

        // Setup final LLM mock for explicit tool invocation
        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                pre_approved_terms: "$50,000 with 10% upfront",
                simulated_concessions: "Agreed to 10% upfront instead of 20%",
                final_margin: 0.38,
                policy_compliance_status: "Compliant"
            })
        });

        // --- EXECUTE STEP 3: CONTRACT NEGOTIATION ---
        const negotiationResult = await simulateContractNegotiation({
            proposal_summary: reviewedProposal,
            client_context: 'HealthTech startup, budget conscious',
            deal_value: 50000
        });

        // Assertions for Step 3
        expect(negotiationResult.isError).toBeUndefined();
        const finalTerms = JSON.parse(negotiationResult.content[0].text);
        expect(finalTerms.status).toBe("Consensus Reached");
        expect(finalTerms.negotiated_terms.pre_approved_terms).toBe("$50,000 with 10% upfront");
        expect(finalTerms.negotiated_terms.final_margin).toBe(0.38);

        // --- STEP 4: REVENUE METRICS MOCKS & EXECUTION ---
        mocks.mockGetXeroClient.mockResolvedValue({
            accountingApi: {
                getReportProfitAndLoss: vi.fn().mockResolvedValue({
                    body: {
                        Reports: [{
                            ReportID: "ProfitAndLoss",
                            ReportName: "Profit and Loss",
                            ReportType: "ProfitAndLoss",
                            Rows: [
                                { RowType: "Section", Title: "Revenue", Rows: [{ Cells: [{ Value: "100000" }] }] },
                                { RowType: "Section", Title: "Operating Expenses", Rows: [{ Cells: [{ Value: "60000" }] }] }
                            ]
                        }]
                    }
                })
            }
        });
        mocks.mockGetTenantId.mockResolvedValue("tenant-123");

        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                metrics: {
                    mrr_arr_growth_rate: 25,
                    cac: 1500,
                    ltv: 25000,
                    lead_to_close_rate: 12
                },
                growth_score: 85,
                report: "Strong growth observed, exceeding strategy targets."
            })
        });

        // --- EXECUTE STEP 4: TRACK REVENUE GROWTH ---
        const revenueResult = await trackRevenueGrowth({ period: 'last_quarter', company: 'test_co' });

        // Assertions for Step 4
        expect(revenueResult.isError).toBeUndefined();
        const revenueData = JSON.parse(revenueResult.content[0].text);
        expect(revenueData.growth_score).toBeGreaterThan(70);
        expect(revenueData.metrics.mrr_arr_growth_rate).toBe(25);
        expect(revenueData.report).toContain("Strong growth");
    });



    it('should handle template missing error gracefully', async () => {
         mocks.mockExistsSync.mockReturnValue(false);

         const result = await generateClientProposal({
            company_name: 'TechCorp',
            project_scope: 'Build an AI assistant',
            estimated_hours: 100
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error: sops/proposal_template.md not found.');
    });
});
