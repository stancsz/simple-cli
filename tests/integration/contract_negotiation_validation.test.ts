import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContractNegotiationTools } from '../../src/mcp_servers/business_ops/tools/contract_negotiation.js';

// Hoist mocks
const mocks = vi.hoisted(() => ({
    mockInit: vi.fn(),
    mockRecall: vi.fn(),
    mockStore: vi.fn(),
    mockHireWorker: vi.fn(),
    mockDelegateTask: vi.fn(),
    mockGenerate: vi.fn()
}));

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => ({
    EpisodicMemory: vi.fn().mockImplementation(() => ({
        init: mocks.mockInit,
        recall: mocks.mockRecall,
        store: mocks.mockStore
    }))
}));

// Mock OpenCoworkServer
vi.mock('../../src/mcp_servers/opencowork/index.js', () => ({
    OpenCoworkServer: vi.fn().mockImplementation(() => ({
        hireWorker: mocks.mockHireWorker,
        delegateTask: mocks.mockDelegateTask
    }))
}));

// Mock LLM
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mocks.mockGenerate
    })
}));

describe('Contract Negotiation Validation (Phase 26)', () => {
    let server: McpServer;
    let simulateContractNegotiation: Function;

    beforeEach(() => {
        vi.clearAllMocks();

        server = new McpServer({ name: 'test_ops', version: '1.0.0' });

        const originalTool = server.tool.bind(server);
        vi.spyOn(server, 'tool').mockImplementation((name, desc, schema, func) => {
            if (name === 'simulate_contract_negotiation') {
                simulateContractNegotiation = func;
            }
            return originalTool(name, desc, schema, func);
        });

        registerContractNegotiationTools(server);
    });

    it('should simulate a successful multi-round negotiation', async () => {
        // Mock Policy
        mocks.mockRecall.mockResolvedValue([{
            agentResponse: JSON.stringify({
                version: 1,
                isActive: true,
                parameters: { min_margin: 0.3, risk_tolerance: "medium" }
            })
        }]);

        // Mock Swarm Interactions (Round 1: Sales -> Client -> Legal)
        mocks.mockDelegateTask
            // Round 1
            .mockResolvedValueOnce({ content: [{ text: "Sales pitch: $50,000 for full scope." }] }) // Sales
            .mockResolvedValueOnce({ content: [{ text: "Counter: We only have $30,000." }] }) // Client
            .mockResolvedValueOnce({ content: [{ text: "Reject: Margin too low." }] }) // Legal
            // Round 2
            .mockResolvedValueOnce({ content: [{ text: "Sales pitch: $30,000 for reduced MVP scope." }] }) // Sales
            .mockResolvedValueOnce({ content: [{ text: "I ACCEPT this MVP scope." }] }); // Client (Consensus)

        // Mock Final Synthesis LLM
        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                pricing_structure: "$30,000 MVP",
                scope_adjustments: "Reduced scope to meet budget",
                timeline: "2 months",
                key_risks: "None",
                approval_confidence_score: 0.95
            })
        });

        const result = await simulateContractNegotiation({
            proposal_draft: "Initial draft: $50,000 full scope.",
            client_profile: "budget-conscious startup",
            negotiation_parameters: { max_rounds: 3, temperature: 0.7 }
        });

        expect(result.isError).toBeUndefined();

        const finalOutput = JSON.parse(result.content[0].text);
        expect(finalOutput.status).toBe("Consensus Reached");
        expect(finalOutput.negotiated_terms.pricing_structure).toBe("$30,000 MVP");

        // Verify swarm orchestration
        expect(mocks.mockHireWorker).toHaveBeenCalledTimes(3);
        expect(mocks.mockDelegateTask).toHaveBeenCalledTimes(5); // 3 from R1, 2 from R2

        // Verify Brain storage
        expect(mocks.mockStore).toHaveBeenCalledTimes(1);
        const storeArgs = mocks.mockStore.mock.calls[0];
        expect(storeArgs[0]).toMatch(/^negotiation_\d+$/);
        expect(storeArgs[3]).toEqual(["negotiation_pattern", "contract", "phase_26"]);
    });

    it('should simulate a policy violation breakdown (max rounds exceeded)', async () => {
         // Mock Policy
         mocks.mockRecall.mockResolvedValue([{
            agentResponse: JSON.stringify({
                version: 1,
                isActive: true,
                parameters: { min_margin: 0.5, risk_tolerance: "low" }
            })
        }]);

        // Mock Swarm Interactions: Client demands unlimited liability, Legal rejects every time.
        mocks.mockDelegateTask.mockImplementation(async (worker) => {
            if (worker === "sales_agent") return { content: [{ text: "Sales pitch: Standard terms." }] };
            if (worker === "client_proxy_agent") return { content: [{ text: "Counter: We demand unlimited liability." }] };
            if (worker === "legal_finance_agent") return { content: [{ text: "Reject: Unlimited liability violates policy." }] };
        });

        // Mock Final Synthesis LLM
        mocks.mockGenerate.mockResolvedValueOnce({
            message: JSON.stringify({
                pricing_structure: "Standard",
                scope_adjustments: "None",
                timeline: "Unknown",
                key_risks: "Client insists on unlimited liability, unacceptable.",
                approval_confidence_score: 0.1
            })
        });

        const result = await simulateContractNegotiation({
            proposal_draft: "Standard terms.",
            client_profile: "enterprise heavyweight",
            negotiation_parameters: { max_rounds: 2, temperature: 0.7 }
        });

        expect(result.isError).toBeUndefined();

        const finalOutput = JSON.parse(result.content[0].text);
        expect(finalOutput.status).toBe("Max Rounds Exceeded");
        expect(finalOutput.negotiated_terms.approval_confidence_score).toBe(0.1);

        // Verify swarm orchestration (2 rounds * 3 agents = 6 delegations)
        expect(mocks.mockDelegateTask).toHaveBeenCalledTimes(6);
    });
});
