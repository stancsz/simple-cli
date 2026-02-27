
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EconomicCycleSimulator, SimulationClient } from '../../scripts/simulate_economic_cycle.js';
import { join } from 'path';
import { rm, readFile, mkdir } from 'fs/promises';

// --- Mocks ---

const {
    mockLinearClient,
    mockHubSpotClient,
    mockXeroClient,
    mockEpisodicMemory,
    mockLLM,
    mockWorldState,
    mockMCPInstance
} = vi.hoisted(() => {
    // 1. World State
    const _mockWorldState = {
        invoices: [
            { total: 15000, amountDue: 0, status: 'PAID', date: new Date().toISOString() },
            { total: 5000, amountDue: 5000, status: 'AUTHORISED', date: new Date().toISOString() }
        ],
        issues: [
            { id: '1', state: { type: 'completed' }, createdAt: new Date(Date.now() - 86400000), completedAt: new Date() },
            { id: '2', state: { type: 'started' }, createdAt: new Date() }
        ],
        deals: [
            { properties: { amount: "20000", dealstage: "closedwon" } }
        ]
    };

    // 2. Clients
    const _mockLinearClient = {
        issues: vi.fn().mockResolvedValue({ nodes: _mockWorldState.issues }),
        issue: vi.fn(),
        // Add projects mock for fleet status
        projects: vi.fn().mockResolvedValue({
            nodes: [
                {
                    id: "proj_123",
                    name: "Mock Company",
                    state: { type: "started" },
                    updatedAt: new Date(),
                    issues: vi.fn().mockResolvedValue({ nodes: [] })
                }
            ]
        })
    };
    const _mockHubSpotClient = {
        crm: {
            deals: {
                searchApi: {
                    doSearch: vi.fn().mockResolvedValue({ results: _mockWorldState.deals })
                }
            }
        }
    };
    const _mockXeroClient = {
        accountingApi: {
            getInvoices: vi.fn().mockResolvedValue({ body: { invoices: _mockWorldState.invoices } }),
            getContacts: vi.fn().mockResolvedValue({ body: { contacts: [] } })
        }
    };

    // 3. Brain & LLM
    const _mockEpisodicMemory = {
        init: vi.fn().mockResolvedValue(undefined),
        recall: vi.fn().mockResolvedValue([]), // Return empty for cache misses
        store: vi.fn().mockResolvedValue(undefined)
    };

    const _mockLLM = {
        generate: vi.fn().mockImplementation(async (prompt, history) => {
            // Return structured JSON based on prompt keywords to simulate tool logic
            if (prompt.includes("Competitor Analysis") || (history && history.some(h => h.content && h.content.includes("Competitor Analysis")))) {
                return { message: JSON.stringify({ pricing_model: "Subscription", extracted_offerings: [] }) };
            }
            if (prompt.includes("Pricing Strategy")) {
                return { message: JSON.stringify([{ service_name: "Web App", current_price: 15000, recommended_price: 16000, confidence_score: 0.9, reasoning: "High demand" }]) };
            }
            // Add catch for "Chief Economic Officer" prompt which is used in Pricing Optimization
            if (prompt.includes("Chief Economic Officer")) {
                 return { message: JSON.stringify([{ service_name: "Web App", current_price: 15000, recommended_price: 16000, confidence_score: 0.9, reasoning: "High demand" }]) };
            }

            if (prompt.includes("Service Adjustment")) {
                return { message: JSON.stringify([{ bundle_name: "AI Audit", description: "Audit", target_client_profile: "Tech", recommended_price: 5000, price_justification: "N/A", expected_margin: 0.5, confidence_score: 0.8 }]) };
            }
            // Add catch for "Chief Strategy Officer" prompt which is used in Service Adjustment
            if (prompt.includes("Chief Strategy Officer")) {
                return { message: JSON.stringify([{ bundle_name: "AI Audit", description: "Audit", target_client_profile: "Tech", recommended_price: 5000, price_justification: "N/A", expected_margin: 0.5, confidence_score: 0.8 }]) };
            }
            if (prompt.includes("Resource Allocation") || prompt.includes("allocate resources")) {
                return { message: JSON.stringify({ recommendation: "maintain", reasoning: "Stable load", confidence_score: 85 }) };
            }
            if (prompt.includes("Executive Business Insight") || prompt.includes("Executive Summary")) {
                return { message: "## Executive Summary\n\nOverall performance is strong. Revenue is up 10%." };
            }
            if (prompt.includes("Market Research") || prompt.includes("market analysis")) {
                return { message: JSON.stringify({ analysis: { trend: "Upward" } }) };
            }
             // For "collect_market_data" enhancement prompt
            if (prompt.includes("Synthesize a market analysis")) {
                 return { message: JSON.stringify({ analysis: { trend: "Market is booming" } }) };
            }
            return { message: "{}" };
        })
    };

    // 4. MCP
    const _mockMCPInstance = {
        init: vi.fn().mockResolvedValue(undefined),
        getClient: vi.fn().mockReturnValue({ callTool: vi.fn() })
    };

    return {
        mockLinearClient: _mockLinearClient,
        mockHubSpotClient: _mockHubSpotClient,
        mockXeroClient: _mockXeroClient,
        mockEpisodicMemory: _mockEpisodicMemory,
        mockLLM: _mockLLM,
        mockWorldState: _mockWorldState,
        mockMCPInstance: _mockMCPInstance
    };
});

// --- Module Mocks ---
vi.mock('@linear/sdk', () => ({ LinearClient: vi.fn(() => mockLinearClient) }));
vi.mock('@hubspot/api-client', () => ({ Client: vi.fn(() => mockHubSpotClient) }));
vi.mock('xero-node', () => ({ XeroClient: vi.fn(() => mockXeroClient) }));
vi.mock('../../src/mcp_servers/business_ops/xero_tools.js', () => ({
    getXeroClient: vi.fn().mockResolvedValue(mockXeroClient),
    getTenantId: vi.fn().mockResolvedValue('tenant_1')
}));
vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => ({
    getLinearClient: vi.fn(() => mockLinearClient)
}));
vi.mock('../../src/mcp_servers/business_ops/crm.js', () => ({
    getHubSpotClient: vi.fn(() => mockHubSpotClient)
}));
vi.mock('../../src/brain/episodic.js', () => ({ EpisodicMemory: vi.fn(() => mockEpisodicMemory) }));
vi.mock('../../src/llm.js', () => ({ createLLM: vi.fn(() => mockLLM) }));
vi.mock('../../src/mcp.js', () => ({ MCP: vi.fn(() => mockMCPInstance) }));

// Import Real Tools (must be AFTER mocks)
import { registerPerformanceAnalyticsTools } from '../../src/mcp_servers/business_ops/tools/performance_analytics.js';
import { registerMarketAnalysisTools } from '../../src/mcp_servers/business_ops/tools/market_analysis.js';
import { registerPricingOptimizationTools } from '../../src/mcp_servers/business_ops/tools/pricing_optimization.js';
import { registerServiceAdjustmentTools } from '../../src/mcp_servers/business_ops/tools/service_adjustment.js';
import { registerResourceAllocationTools } from '../../src/mcp_servers/business_ops/tools/resource_allocation.js';
import { registerEconomicOptimizationTools } from '../../src/mcp_servers/business_ops/tools/economic_optimization.js';
import { registerSwarmFleetManagementTools } from '../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js';

// --- Test Setup ---

// Simple Mock Server Implementation
class MockMcpServer {
    tools: Record<string, Function> = {};
    tool(name: string, desc: string, schema: any, handler: Function) {
        this.tools[name] = handler;
    }
    // Updated to match the expected signature in some tools if they check 'this' context or similar,
    // but mostly just needs to route calls.
    async callTool(name: string, args: any) {
        if (this.tools[name]) {
            try {
                return await this.tools[name](args);
            } catch (e) {
                return { isError: true, content: [{ text: (e as Error).message }] };
            }
        }
        throw new Error(`Tool ${name} not found`);
    }
}

describe('Economic Cycle Validation', () => {
    let server: MockMcpServer;
    let client: SimulationClient;
    let simulator: EconomicCycleSimulator;
    const outputDir = join(process.cwd(), 'tests', 'output');

    beforeEach(async () => {
        vi.clearAllMocks();

        process.env.LINEAR_API_KEY = "mock_linear_key";
        process.env.XERO_CLIENT_ID = "mock_xero_id";
        process.env.XERO_CLIENT_SECRET = "mock_xero_secret";

        // Mock global fetch for market analysis
        global.fetch = vi.fn().mockImplementation(() => Promise.resolve({
            ok: true,
            text: () => Promise.resolve("<html><body>Mock Competitor Pricing: $99/mo</body></html>"),
            status: 200
        }));

        // Setup Output Dir
        await mkdir(outputDir, { recursive: true });

        // Setup Server
        server = new MockMcpServer();

        // Register ALL Economic Tools
        // Note: Some tools accept (server) and others (server, mcpClient).
        // We cast to any to bypass strict type checks against the real McpServer class in tests.
        registerPerformanceAnalyticsTools(server as any);
        registerMarketAnalysisTools(server as any);
        registerPricingOptimizationTools(server as any);
        registerServiceAdjustmentTools(server as any);
        registerResourceAllocationTools(server as any, mockMCPInstance as any);
        registerEconomicOptimizationTools(server as any);

        // Register Dependencies
        registerSwarmFleetManagementTools(server as any);

        // Setup Client Adapter
        client = {
            callTool: async (name, args) => await server.callTool(name, args)
        };

        // Setup Simulator
        simulator = new EconomicCycleSimulator(client, {
            quarter: 3,
            year: 2024,
            outputDir: outputDir
        });
    });

    afterEach(async () => {
        // Cleanup output
        await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should execute the full 90-day economic optimization cycle', async () => {
        console.log("Running Economic Cycle Validation...");

        await simulator.run();

        const logs = simulator.getLogs();

        // 1. Verify Sequence
        expect(logs.some(l => l.includes("Phase 1: Analyzing Performance"))).toBe(true);
        expect(logs.some(l => l.includes("Phase 2: Gathering Market"))).toBe(true);
        expect(logs.some(l => l.includes("Phase 3: Optimizing Pricing"))).toBe(true);
        expect(logs.some(l => l.includes("Phase 4: Adjusting Service"))).toBe(true);
        expect(logs.some(l => l.includes("Phase 5: Planning Resource"))).toBe(true);
        expect(logs.some(l => l.includes("Phase 6: Generating Final Executive Report"))).toBe(true);

        // 2. Verify Tool Interaction
        expect(mockXeroClient.accountingApi.getInvoices).toHaveBeenCalled(); // Performance
        expect(mockLinearClient.issues).toHaveBeenCalled(); // Performance
        expect(mockLLM.generate).toHaveBeenCalled(); // various steps

        // 3. Verify Artifact Generation
        const reportPath = join(outputDir, 'economic_optimization_report_Q3_2024.md');
        const reportContent = await readFile(reportPath, 'utf-8');

        expect(reportContent).toContain("# Economic Optimization Report - Q3 2024");
        expect(reportContent).toContain("## 1. Executive Summary");
        expect(reportContent).toContain("## 4. Strategic Recommendations");
        expect(reportContent).toContain("Web App"); // Pricing Rec
        expect(reportContent).toContain("AI Audit"); // Service Rec

        console.log("Generated Report Preview:\n" + reportContent.substring(0, 500) + "...");
    });
});
