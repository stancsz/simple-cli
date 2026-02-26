import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Dependencies
const mockXeroClient = {
    accountingApi: {
        getInvoices: vi.fn().mockResolvedValue({
            body: {
                invoices: [
                    { total: 5000, amountDue: 0, status: 'PAID' },
                    { total: 3000, amountDue: 1000, status: 'AUTHORISED' }
                ]
            }
        })
    }
};

const mockLinearClient = {
    issues: vi.fn().mockResolvedValue({
        nodes: [
            { state: Promise.resolve({ type: 'completed' }), createdAt: new Date(), completedAt: new Date() },
            { state: Promise.resolve({ type: 'started' }), createdAt: new Date() },
            { state: Promise.resolve({ type: 'completed' }), createdAt: new Date(), completedAt: new Date() }
        ]
    })
};

const mockHubSpotClient = {
    crm: {
        deals: {
            searchApi: {
                doSearch: vi.fn().mockResolvedValue({
                    results: [{ id: 'deal1' }, { id: 'deal2' }]
                })
            }
        }
    }
};

const mockMemory = {
    init: vi.fn(),
    recall: vi.fn().mockResolvedValue([]),
    store: vi.fn()
};

const mockLLM = {
    generate: vi.fn().mockResolvedValue({
        message: JSON.stringify([
            {
                action: "create",
                bundle_name: "AI Readiness Audit",
                description: "Initial assessment for AI integration.",
                target_price: 2500,
                expected_margin: 0.4,
                reasoning: "High market demand and internal capability.",
                confidence_score: 0.9
            },
            {
                action: "modify",
                bundle_name: "Standard Maintenance",
                description: "Increase retainer to cover support costs.",
                target_price: 3500,
                expected_margin: 0.25,
                reasoning: "Margins slipping due to increased volume.",
                confidence_score: 0.85
            }
        ])
    })
};

// Hoist Mocks
vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => ({
    getXeroClient: vi.fn(() => Promise.resolve(mockXeroClient)),
    getTenantId: vi.fn(() => Promise.resolve('tenant-123'))
}));

vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => ({
    getLinearClient: vi.fn(() => mockLinearClient)
}));

vi.mock('../../src/mcp_servers/business_ops/crm.js', () => ({
    getHubSpotClient: vi.fn(() => mockHubSpotClient)
}));

vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn(() => mockMemory)
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn(() => mockLLM)
}));

// Import Tool Implementation (after mocks)
import { registerServiceAdjustmentTools } from '../../src/mcp_servers/business_ops/tools/service_adjustment.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Service Adjustment Tool', () => {
    let server: McpServer;
    let toolHandler: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        server = new McpServer({ name: 'test', version: '1.0.0' });

        // Mock server.tool to capture the handler
        const toolSpy = vi.spyOn(server, 'tool');
        registerServiceAdjustmentTools(server);

        // Get the handler for 'adjust_service_offerings'
        const call = toolSpy.mock.calls.find(c => c[0] === 'adjust_service_offerings');
        if (!call) throw new Error('Tool not registered');
        toolHandler = call[3];
    });

    it('should generate recommendations based on inputs and mocked data', async () => {
        const input = {
            current_bundles: [
                { name: 'Standard Maintenance', price: 3000, components: ['Bug Fixes'], active_clients: 5 }
            ]
        };

        const result = await toolHandler(input);
        const content = JSON.parse(result.content[0].text);

        // Verify Data Fetching
        expect(mockXeroClient.accountingApi.getInvoices).toHaveBeenCalled();
        expect(mockLinearClient.issues).toHaveBeenCalled();
        expect(mockHubSpotClient.crm.deals.searchApi.doSearch).toHaveBeenCalled();

        // Verify LLM Interaction
        expect(mockLLM.generate).toHaveBeenCalledWith(
            expect.stringContaining('You are a Chief Strategy Officer'),
            expect.any(Array)
        );

        // Verify Output Structure
        expect(content).toHaveLength(2);
        expect(content[0]).toMatchObject({
            action: "create",
            bundle_name: "AI Readiness Audit",
            target_price: 2500,
            confidence_score: 0.9
        });
        expect(content[1]).toMatchObject({
            action: "modify",
            bundle_name: "Standard Maintenance",
            target_price: 3500
        });

        // Verify Memory Storage
        expect(mockMemory.store).toHaveBeenCalledWith(
            expect.stringContaining('service_adjustment_'),
            "Service Adjustment Recommendation",
            expect.any(String),
            expect.arrayContaining(["service_adjustment"]),
            undefined, undefined, false, undefined, undefined, 0, 0,
            "service_recommendation"
        );
    });

    it('should handle idempotency correctly', async () => {
        // Mock recent run found in memory
        mockMemory.recall.mockResolvedValueOnce([{
            timestamp: new Date().toISOString(),
            agentResponse: 'Cached Recommendation'
        }]);

        const input = { current_bundles: [] };
        const result = await toolHandler(input);

        expect(result.content[0].text).toContain('Service adjustment analysis already run recently');
        expect(mockLLM.generate).not.toHaveBeenCalled();
    });

    it('should fallback gracefully if LLM fails', async () => {
        mockLLM.generate.mockRejectedValueOnce(new Error('LLM Error'));

        const input = {
            current_bundles: [
                { name: 'Fallback Bundle', price: 100 }
            ]
        };

        const result = await toolHandler(input);
        const content = JSON.parse(result.content[0].text);

        expect(content).toHaveLength(1);
        expect(content[0]).toMatchObject({
            action: "keep",
            bundle_name: "Fallback Bundle",
            reasoning: "Analysis failed, maintaining status quo."
        });
    });
});
