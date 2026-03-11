import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolicEngine } from '../../src/symbolic/compiler.js';
import { TaskGraph } from '../../src/symbolic/task_graph.js';
import { RuleEngine } from '../../src/symbolic/rule_engine.js';
import { BrainServer } from '../../src/mcp_servers/brain/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';

// Mock dependencies
vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn().mockReturnValue({
        generate: vi.fn().mockResolvedValue({
            message: `\`\`\`json
            {
              "id": "test_graph_1",
              "name": "routine_onboarding",
              "trigger_intent": "onboard client",
              "startNode": "step1",
              "contextVariables": ["deal_amount"],
              "nodes": {
                "step1": {
                  "id": "step1",
                  "type": "tool_call",
                  "toolName": "fetch_client_data",
                  "argumentsTemplate": { "id": "{{client_id}}" },
                  "resultKey": "client_data",
                  "next": "step2"
                },
                "step2": {
                  "id": "step2",
                  "type": "condition",
                  "condition": "deal_amount > 10000",
                  "next": { "true": "step3_high", "false": "step3_low" }
                },
                "step3_high": {
                  "id": "step3_high",
                  "type": "data_transform",
                  "inputKey": "client_data",
                  "outputKey": "processed_data"
                },
                "step3_low": {
                  "id": "step3_low",
                  "type": "tool_call",
                  "toolName": "standard_setup",
                  "argumentsTemplate": {}
                }
              }
            }
            \`\`\``
        }),
        disableRouting: true
    }),
    createLLMInstance: vi.fn()
}));

vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            recall: vi.fn().mockResolvedValue([{ id: 'ep1', userPrompt: 'onboard client X', agentResponse: 'success' }])
        }))
    };
});

describe('Phase 29: Symbolic Compiler & Rule Engine Validation', () => {
    let engine: SymbolicEngine;
    let ruleEngine: RuleEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new SymbolicEngine();
        ruleEngine = new RuleEngine();
    });

    it('RuleEngine: evaluates simple conditions', () => {
        const ctx = { deal_amount: 15000, status: 'active', meta: { is_vip: true } };
        expect(ruleEngine.evaluateCondition("deal_amount > 10000", ctx)).toBe(true);
        expect(ruleEngine.evaluateCondition("deal_amount < 10000", ctx)).toBe(false);
        expect(ruleEngine.evaluateCondition("status == 'active'", ctx)).toBe(true);
        expect(ruleEngine.evaluateCondition("meta.is_vip == true", ctx)).toBe(true);
        expect(ruleEngine.evaluateCondition("meta.is_vip", ctx)).toBe(true); // Truthy check
    });

    it('RuleEngine: resolves templates correctly', () => {
        const ctx = { client: { id: "123", name: "Acme" }, amount: 5000 };
        const template = {
            id: "{{client.id}}",
            desc: "Onboard {{client.name}} for {{amount}}",
            nested: ["{{client.id}}"]
        };
        const resolved = ruleEngine.resolveTemplate(template, ctx);
        expect(resolved).toEqual({
            id: "123",
            desc: "Onboard Acme for 5000",
            nested: ["123"]
        });
    });

    it('SymbolicCompiler: compiles episodic memory into TaskGraph', async () => {
        const mockEpisodic = new EpisodicMemory('mock');
        const graph = await engine.compile("routine_onboarding", ["ep1", "ep2"], mockEpisodic);

        expect(graph).toBeDefined();
        expect(graph?.name).toBe("routine_onboarding");
        expect(graph?.nodes['step2'].type).toBe('condition');

        // Ensure it was cached in the engine
        const cachedGraph = engine.getGraphByIntent("can you onboard client X?");
        expect(cachedGraph).toBeDefined();
        expect(cachedGraph?.name).toBe("routine_onboarding");
    });

    it('SymbolicEngine: executes TaskGraph deterministically', async () => {
        const mockEpisodic = new EpisodicMemory('mock');
        const graph = await engine.compile("routine_onboarding", ["ep1"], mockEpisodic);

        const mockToolCall = vi.fn().mockImplementation(async (name) => {
            if (name === 'fetch_client_data') return { content: [{ text: JSON.stringify({ name: 'Acme Corp' }) }] };
            return { content: [{ text: 'done' }] };
        });

        const ctxHigh = { client_id: "123", deal_amount: 15000 };
        const resultHigh = await engine.execute(graph!, ctxHigh, mockToolCall);

        // Should take the true branch (step3_high data_transform)
        expect(mockToolCall).toHaveBeenCalledWith('fetch_client_data', { id: "123" });
        expect(mockToolCall).not.toHaveBeenCalledWith('standard_setup', expect.anything());
        expect(resultHigh.processed_data).toEqual({ name: 'Acme Corp' });

        mockToolCall.mockClear();

        const ctxLow = { client_id: "456", deal_amount: 5000 };
        const resultLow = await engine.execute(graph!, ctxLow, mockToolCall);

        // Should take the false branch (step3_low tool_call)
        expect(mockToolCall).toHaveBeenCalledWith('fetch_client_data', { id: "456" });
        expect(mockToolCall).toHaveBeenCalledWith('standard_setup', {});
    });
});
