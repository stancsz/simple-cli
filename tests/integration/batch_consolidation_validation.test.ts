import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchExecutor } from '../../src/scheduler/batch_executor';
import { BatchPromptBuilder } from '../../src/llm/batch_prompt_builder';
import { TaskDefinition } from '../../src/interfaces/daemon';

// Mock dependencies
vi.mock('../../src/llm', () => ({
    createLLM: vi.fn(() => ({
        generateBatched: vi.fn(async (system, tasks) => {
            // Mock LLM response parsing based on task inputs
            return tasks.map((t: any) => ({
                id: t.id,
                status: 'success',
                thought: `Processed ${t.id}`,
                tool: 'none',
                message: `Result for ${t.id}`
            }));
        })
    }))
}));

vi.mock('../../src/logger', () => ({
    logMetric: vi.fn()
}));

describe('Phase 28: Batch Prompt Consolidation', () => {
    let executor: BatchExecutor;

    beforeEach(() => {
        vi.useFakeTimers();
        // Since BatchExecutor reads from loadConfig (which reads files), we'll mock that if needed
        // but it defaults nicely to enabled.
        executor = new BatchExecutor();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should correctly identify batchable tasks based on type', () => {
        const batchableTask1: TaskDefinition = { id: 'task-1', name: 'daily strategic_scan', trigger: 'cron', prompt: 'scan horizon' };
        const batchableTask2: TaskDefinition = { id: 'task-2', name: 'performance_metrics check', trigger: 'cron', prompt: 'check metrics' };
        const nonBatchableTask: TaskDefinition = { id: 'task-3', name: 'random user query', trigger: 'webhook', prompt: 'hello' };
        const noPromptTask: TaskDefinition = { id: 'task-4', name: 'strategic_scan', trigger: 'cron' }; // Missing prompt

        expect(executor.isBatchable(batchableTask1)).toBe(true);
        expect(executor.isBatchable(batchableTask2)).toBe(true);
        expect(executor.isBatchable(nonBatchableTask)).toBe(false);
        expect(executor.isBatchable(noPromptTask)).toBe(false);
    });

    it('should group 3 overlapping strategic scans and execute as a single batch', async () => {
        const tasks: TaskDefinition[] = [
            { id: 'scan-1', name: 'strategic_scan', company: 'tenant-a', trigger: 'cron', prompt: 'Scan 1' },
            { id: 'scan-2', name: 'strategic_scan', company: 'tenant-a', trigger: 'cron', prompt: 'Scan 2' },
            { id: 'scan-3', name: 'strategic_scan', company: 'tenant-a', trigger: 'cron', prompt: 'Scan 3' },
        ];

        // Enqueue them
        const p1 = executor.enqueue(tasks[0]);
        const p2 = executor.enqueue(tasks[1]);
        const p3 = executor.enqueue(tasks[2]);

        // Fast forward time to trigger window (default is 5 mins, we use 5 mins = 300000 ms)
        vi.advanceTimersByTime(300000);

        const results = await Promise.all([p1, p2, p3]);

        expect(results).toHaveLength(3);
        expect(results[0].id).toBe('scan-1');
        expect(results[0].status).toBe('success');
        expect(results[1].id).toBe('scan-2');
        expect(results[2].id).toBe('scan-3');
    });

    it('should respect maxBatchSize constraints', async () => {
        const tasks: TaskDefinition[] = [];
        for (let i = 0; i < 6; i++) {
            tasks.push({ id: `scan-${i}`, name: 'strategic_scan', company: 'tenant-a', trigger: 'cron', prompt: `Scan ${i}` });
        }

        // maxBatchSize is 5 by default. Enqueuing 5 should trigger processing immediately.
        const promises = tasks.map(t => executor.enqueue(t));

        // Advance timer heavily to ensure any pending promises resolve
        for (let j = 0; j < 5; j++) {
             await Promise.resolve();
             vi.advanceTimersByTime(300000);
        }

        const results = await Promise.all(promises);
        expect(results).toHaveLength(6);
        results.forEach((r, i) => expect(r.id).toBe(`scan-${i}`));
    });

    it('should isolate batches by company/tenant', async () => {
        const tasks: TaskDefinition[] = [
            { id: 'scan-a1', name: 'strategic_scan', company: 'tenant-a', trigger: 'cron', prompt: 'Scan A' },
            { id: 'scan-b1', name: 'strategic_scan', company: 'tenant-b', trigger: 'cron', prompt: 'Scan B' },
        ];

        const promises = tasks.map(t => executor.enqueue(t));

        // Wait for the window
        vi.advanceTimersByTime(300000);

        const results = await Promise.all(promises);
        expect(results[0].id).toBe('scan-a1');
        expect(results[1].id).toBe('scan-b1');
    });

    describe('BatchPromptBuilder', () => {
        it('should correctly build a meta-prompt from multiple tasks', () => {
            const inputs = [
                { id: 'task-1', prompt: 'Analyze X' },
                { id: 'task-2', prompt: 'Analyze Y' }
            ];

            const prompt = BatchPromptBuilder.buildPrompt(inputs, 'System info here.');

            expect(prompt).toContain('System info here.');
            expect(prompt).toContain('ID: task-1');
            expect(prompt).toContain('PROMPT: Analyze X');
            expect(prompt).toContain('ID: task-2');
            expect(prompt).toContain('PROMPT: Analyze Y');
        });

        it('should accurately parse a well-formed JSON array response', () => {
            const rawResponse = `
                Here is the result:
                [
                    { "id": "t1", "thought": "Thinking 1", "tool": "none", "args": {}, "message": "Done 1" },
                    { "id": "t2", "thought": "Thinking 2", "tool": "search", "args": {"q": "test"}, "message": "Done 2" }
                ]
            `;

            const results = BatchPromptBuilder.parseResponse(rawResponse, ['t1', 't2']);

            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('t1');
            expect(results[0].status).toBe('success');
            expect(results[1].id).toBe('t2');
            expect(results[1].tool).toBe('search');
            expect(results[1].args).toEqual({ q: "test" });
        });

        it('should handle missing task IDs gracefully', () => {
            const rawResponse = `
                [
                    { "id": "t1", "thought": "Thinking 1" }
                ]
            `;

            const results = BatchPromptBuilder.parseResponse(rawResponse, ['t1', 't2']);

            expect(results).toHaveLength(2);
            expect(results[0].status).toBe('success');
            expect(results[1].status).toBe('failed');
            expect(results[1].error).toContain('missing');
        });

        it('should handle completely malformed responses by failing all tasks', () => {
            const rawResponse = "Sorry, I can't do that. Not JSON at all.";
            const results = BatchPromptBuilder.parseResponse(rawResponse, ['t1', 't2']);

            expect(results).toHaveLength(2);
            expect(results[0].status).toBe('failed');
            expect(results[1].status).toBe('failed');
        });
    });
});