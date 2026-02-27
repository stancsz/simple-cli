import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProposalGenerationTools } from '../../src/mcp_servers/business_ops/tools/proposal_generation.js';
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
    mockReadFileSync: vi.fn()
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
    syncDealToHubSpot: mocks.mockSyncDeal
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

describe('Intelligent Proposal Generation (Phase 26)', () => {
    let server: McpServer;
    let generateClientProposal: Function;

    beforeEach(() => {
        vi.clearAllMocks();

        server = new McpServer({ name: 'test_ops', version: '1.0.0' });

        const originalTool = server.tool.bind(server);
        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (name === 'generate_client_proposal') {
                generateClientProposal = func;
            }
            return originalTool(name, desc, schema, func);
        });

        registerProposalGenerationTools(server);
    });

    it('should generate a proposal synthesizing strategy, past projects, and policy', async () => {
        // Setup Mocks
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
# Project Proposal: TechCorp
## 1. Executive Summary
This is a great executive summary.
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

        mocks.mockStore.mockResolvedValue(undefined);
        mocks.mockSyncDeal.mockResolvedValue({ id: 'deal_123', action: 'created' });

        // Execute Tool
        const result = await generateClientProposal({
            company_name: 'TechCorp',
            project_scope: 'Build an AI assistant',
            estimated_hours: 100
        });

        // Assertions
        expect(result.isError).toBeUndefined();

        const contentStr = result.content[0].text;
        expect(contentStr).toContain('Proposal generated successfully');
        expect(contentStr).toContain('TechCorp');
        expect(contentStr).toContain('deal_123');

        // Verify Strategy fetched
        expect(mocks.mockReadStrategy).toHaveBeenCalled();

        // Verify Recall called for past proposals and policy
        expect(mocks.mockRecall).toHaveBeenCalledTimes(2);

        // Verify Template read
        expect(mocks.mockExistsSync).toHaveBeenCalled();
        expect(mocks.mockReadFileSync).toHaveBeenCalled();

        // Verify LLM calls
        expect(mocks.mockGenerate).toHaveBeenCalledTimes(2);
        const genPrompt = mocks.mockGenerate.mock.calls[0][0];
        expect(genPrompt).toContain('TechCorp');
        expect(genPrompt).toContain('Build an AI assistant');
        expect(genPrompt).toContain('100');
        expect(genPrompt).toContain('To be the leading autonomous AI agency.'); // Strategy
        expect(genPrompt).toContain('min_margin'); // Policy
        expect(genPrompt).toContain('Past Proposal 1'); // Past proposals

        const reviewPrompt = mocks.mockGenerate.mock.calls[1][0];
        expect(reviewPrompt).toContain('Supervisor Agent');
        expect(reviewPrompt).toContain('min_margin');

        // Verify Storage
        expect(mocks.mockStore).toHaveBeenCalledTimes(1);
        const storeArgs = mocks.mockStore.mock.calls[0];
        expect(storeArgs[0]).toMatch(/proposal_TechCorp_\d+/);
        expect(storeArgs[2]).toBe(reviewedProposal.trim()); // The final markdown
        expect(storeArgs[3]).toEqual(["proposal", "client_acquisition", "phase_26"]);

        // Verify CRM Sync
        expect(mocks.mockSyncDeal).toHaveBeenCalledTimes(1);
        expect(mocks.mockSyncDeal).toHaveBeenCalledWith(expect.objectContaining({
            dealname: 'Proposal: TechCorp - Build an AI assistant',
            dealstage: 'presentationscheduled'
        }));
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
