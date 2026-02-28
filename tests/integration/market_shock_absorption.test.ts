import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketShockAbsorptionServer } from '../../src/mcp_servers/market_shock_absorption/index.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import * as llmModule from '../../src/llm.js';
import { randomUUID } from 'crypto';

const mockGenerate = vi.fn().mockResolvedValue({
    message: JSON.stringify({
        risk_level: "High",
        vulnerabilities: ["Reduced tech spending", "Longer sales cycles"],
        recommended_actions: ["Increase margins", "Pause hiring"],
        rationale: "High inflation and sector layoffs indicate a severe market contraction."
    })
});

const mockEmbed = vi.fn().mockImplementation(async () => new Array(1536).fill(0.1));
const mockEmbedMany = vi.fn().mockImplementation(async (texts: string[]) => {
    return texts.map(() => new Array(1536).fill(0.1));
});

// Setup explicit vitest mock for the llm module to mock generate and embedMany properly
vi.mock('../../src/llm.js', async () => {
    const actual = await vi.importActual<typeof import('../../src/llm.js')>('../../src/llm.js');
    return {
        ...actual,
        createLLM: vi.fn(() => ({
            generate: mockGenerate,
            embed: mockEmbed,
            embedMany: mockEmbedMany
        }))
    };
});

describe('Market Shock Absorption Integration', () => {
    const testCompanyId = `test_company_shock_${randomUUID()}`;
    let server: MarketShockAbsorptionServer;
    let episodic: EpisodicMemory;

    beforeEach(async () => {
        episodic = new EpisodicMemory();
        await episodic.init();
        server = new MarketShockAbsorptionServer();

        // Clear memories for test company (we just use unique ID)
        vi.clearAllMocks();
    });

    afterEach(async () => {
        // Mock cleanup
    });

    it('should monitor market signals and store them in memory', async () => {
        const monitorHandler = server.server._registeredTools["monitor_market_signals"]?.handler;
        expect(monitorHandler).toBeDefined();

        const result = await monitorHandler!({
            sector: "Software Development",
            region: "US",
            company: testCompanyId
        }, {} as any);

        expect(result.content[0].text).toContain('"status": "success"');
        const data = JSON.parse(result.content[0].text).data;
        expect(data.sector).toBe("Software Development");
        expect(data.macro_indicators.inflation_rate).toBeDefined();

        // Verify it was stored
        const memories = await episodic.recall("Software Development", 1, testCompanyId, "market_signals");
        expect(memories.length).toBeGreaterThan(0);
        expect(memories[0].agentResponse).toContain("Software Development");
    });

    it('should evaluate economic risk using latest market signals', async () => {
        // First, monitor (store) signals so there is something to evaluate
        const monitorHandler = server.server._registeredTools["monitor_market_signals"]?.handler;
        await monitorHandler!({
            sector: "Software Development",
            region: "US",
            company: testCompanyId
        }, {} as any);

        // Then, evaluate
        const evaluateHandler = server.server._registeredTools["evaluate_economic_risk"]?.handler;
        expect(evaluateHandler).toBeDefined();

        const evalResult = await evaluateHandler!({ company: testCompanyId }, {} as any);
        const evalData = JSON.parse(evalResult.content[0].text);

        expect(evalData.risk_level).toBe("High");
        expect(evalData.vulnerabilities).toContain("Reduced tech spending");

        // Verify evaluation was stored
        const memories = await episodic.recall("economic risk evaluation", 1, testCompanyId, "economic_risk_evaluation");
        expect(memories.length).toBeGreaterThan(0);
        expect(memories[0].agentResponse).toContain("High");
    });

    it('should trigger contingency plan for High risk evaluation', async () => {
        // 1. Manually inject a "High" risk evaluation into memory to simulate the previous step
        await episodic.store(
            `economic_risk_eval_high_${Date.now()}`,
            `Economic risk evaluation`,
            JSON.stringify({
                risk_level: "High",
                rationale: "Mocked high risk for testing contingency."
            }),
            ["market_shock"],
            testCompanyId,
            undefined,
            false,
            undefined,
            undefined,
            0,
            0,
            "economic_risk_evaluation"
        );

        // 2. Also manually inject an existing policy to ensure we build off it
        await episodic.store(
            `policy_update_v1`,
            `Initial policy`,
            JSON.stringify({
                id: "initial-policy",
                version: 1,
                name: "Initial Policy",
                parameters: { min_margin: 0.2, risk_tolerance: "medium", max_agents_per_swarm: 5 }
            }),
            ["corporate_policy"],
            testCompanyId,
            undefined,
            undefined,
            undefined,
            "initial-policy",
            0,
            0,
            "corporate_policy"
        );

        const triggerHandler = server.server._registeredTools["trigger_contingency_plan"]?.handler;
        expect(triggerHandler).toBeDefined();

        const triggerResult = await triggerHandler!({ company: testCompanyId }, {} as any);
        expect(triggerResult.content[0].text).toContain("Contingency plan triggered");

        const resultData = JSON.parse(triggerResult.content[0].text);
        const newPolicy = resultData.policy;

        // Verify contingency measures were applied
        expect(newPolicy.version).toBeGreaterThan(0);
        expect(newPolicy.parameters.min_margin).toBeGreaterThanOrEqual(0.3); // High risk contingency min margin
        expect(newPolicy.parameters.risk_tolerance).toBe("low");
        expect(newPolicy.parameters.max_agents_per_swarm).toBe(3); // Scaled down from 5

        // Verify the new policy was saved
        const allMemories = await episodic.recall("corporate_policy", 10, testCompanyId);
        const policyMemories = allMemories.filter(m => m.type === "corporate_policy").sort((a,b) => b.timestamp - a.timestamp);

        expect(policyMemories.length).toBeGreaterThan(0);
        const savedPolicy = JSON.parse(policyMemories[0].agentResponse);
        expect(savedPolicy.version).toBeGreaterThan(0);
        expect(savedPolicy.parameters.risk_tolerance).toBe("low");
    });

    it('should NOT trigger contingency plan for Low risk evaluation', async () => {
        // Clear all previous mocks and memory states from High test evaluation
        const testCompanyIdLow = `test_company_low_${randomUUID()}`;

        // Inject a "Low" risk evaluation
        await episodic.store(
            `economic_risk_eval_low_${Date.now()}`,
            `Economic risk evaluation`,
            JSON.stringify({
                risk_level: "Low",
                rationale: "Mocked low risk for testing."
            }),
            ["market_shock"],
            testCompanyIdLow,
            undefined,
            false,
            undefined,
            undefined,
            0,
            0,
            "economic_risk_evaluation"
        );

        const triggerHandler = server.server._registeredTools["trigger_contingency_plan"]?.handler;

        const triggerResult = await triggerHandler!({ company: testCompanyIdLow }, {} as any);
        expect(triggerResult.content[0].text).toContain("No contingency plan triggered");
    });
});
