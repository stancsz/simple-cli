import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLM } from '../../src/llm';
import { BatchTaskInput } from '../../src/batch/batch_prompt_builder';
import * as configModule from '../../src/config';

// Mock PersonaEngine
vi.mock('../../src/persona', () => ({
    PersonaEngine: vi.fn().mockImplementation(() => ({
        loadConfig: vi.fn(),
        injectPersonality: vi.fn((sys) => sys),
        transformResponse: vi.fn((res) => res)
    }))
}));

// Mock logger
vi.mock('../../src/logger', () => ({
    logMetric: vi.fn()
}));

// Mock config
vi.mock('../../src/config', () => ({
    loadConfig: vi.fn().mockResolvedValue({ batching: { enabled: true } })
}));

describe('Phase 28: Batch Token Consumption Benchmark', () => {
    let mockGenerateText: any;
    let originalGenerateText: any;

    beforeEach(async () => {
        // We'll mock the internal API call in LLM
        // Since we cannot easily mock the external module inside LLM here cleanly,
        // we'll spy on internalGenerate instead, or directly calculate the logic in LLM.

        // Let's use the ai package mock if possible
        const aiModule = await import('ai');
        originalGenerateText = (aiModule as any).generateText;

        mockGenerateText = vi.fn().mockImplementation(({ system, messages }) => {
            const systemTokens = system.length / 4; // very rough token estimation
            const promptTokens = messages.reduce((acc: number, m: any) => acc + (m.content.length / 4), 0);
            const totalIn = systemTokens + promptTokens;

            // Generate dummy JSON response
            const text = JSON.stringify([
               { id: 'task-1', tool: 'none', args: {}, thought: 't1', status: 'success' },
               { id: 'task-2', tool: 'none', args: {}, thought: 't2', status: 'success' },
               { id: 'task-3', tool: 'none', args: {}, thought: 't3', status: 'success' },
               { id: 'task-4', tool: 'none', args: {}, thought: 't4', status: 'success' },
               { id: 'task-5', tool: 'none', args: {}, thought: 't5', status: 'success' }
            ]);

            return Promise.resolve({
                text,
                usage: { promptTokens: totalIn, completionTokens: 100, totalTokens: totalIn + 100 }
            });
        });

        vi.doMock('ai', () => ({
            ...aiModule,
            generateText: mockGenerateText
        }));
    });

    afterEach(() => {
        vi.doUnmock('ai');
    });

    it('should reduce total prompt tokens by at least 40% when batching 5 tasks', async () => {
        const systemPrompt = "You are a corporate AI agent. " + "x".repeat(2000); // ~500 tokens of system prompt
        const llm = new LLM([{ provider: 'openai', model: 'gpt-4' }]);

        // Hack internal method to simulate raw token usage
        vi.spyOn(llm as any, 'internalGenerate').mockImplementation(async (sys: string, hist: any[]) => {
            const sysTokens = sys.length / 4;
            const histTokens = hist.reduce((acc, h) => acc + (h.content.length / 4), 0);
            const inTokens = sysTokens + histTokens;

            return {
                thought: 'test', tool: 'none', args: {}, raw: '{}',
                usage: { promptTokens: inTokens, completionTokens: 50, totalTokens: inTokens + 50 }
            };
        });

        const tasks: BatchTaskInput[] = [];
        for (let i = 1; i <= 5; i++) {
            tasks.push({ id: `task-${i}`, prompt: "Run strategic scan " + "y".repeat(100) }); // ~25 tokens per task
        }

        // Calculate individual cost
        let individualTotal = 0;
        for (const t of tasks) {
            const res = await (llm as any).internalGenerate(systemPrompt, [{ role: 'user', content: t.prompt }]);
            individualTotal += res.usage.promptTokens;
        }

        // Calculate batched cost
        // Meta prompt = systemPrompt + framing + tasks
        const { BatchPromptBuilder } = await import('../../src/batch/batch_prompt_builder');
        const batchedPrompt = BatchPromptBuilder.buildPrompt(tasks, systemPrompt);
        const batchedRes = await (llm as any).internalGenerate(batchedPrompt, [{ role: 'user', content: 'Execute batch' }]);
        const batchedTotal = batchedRes.usage.promptTokens;

        const reduction = ((individualTotal - batchedTotal) / individualTotal) * 100;

        console.log(`Individual Prompt Tokens (5 tasks): ${Math.round(individualTotal)}`);
        console.log(`Batched Prompt Tokens (5 tasks): ${Math.round(batchedTotal)}`);
        console.log(`Token Reduction: ${Math.round(reduction)}%`);

        expect(reduction).toBeGreaterThanOrEqual(40);
        expect(reduction).toBeLessThanOrEqual(90);
    });
});
