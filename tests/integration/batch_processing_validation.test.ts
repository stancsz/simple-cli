import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeBatchRoutines } from '../../src/mcp_servers/brain/tools/efficiency';
import { BatchExecutor } from '../../src/batch/batch_orchestrator';
import { EpisodicMemory } from '../../src/brain/episodic';
import * as fs from 'fs';

vi.mock('fs', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        existsSync: vi.fn(),
        readFileSync: vi.fn()
    };
});

vi.mock('../../src/brain/episodic', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            store: vi.fn(),
            recall: vi.fn()
        }))
    };
});

vi.mock('../../src/batch/batch_orchestrator', () => {
    return {
        globalBatchExecutor: {
            enqueue: vi.fn().mockImplementation((task) => Promise.resolve({
                id: task.id,
                status: 'success',
                message: `Processed ${task.name}`
            })),
            forceProcess: vi.fn().mockResolvedValue(undefined)
        }
    };
});

describe('Phase 28: Batch Processing Validation', () => {
    let episodic: EpisodicMemory;

    beforeEach(() => {
        episodic = new EpisodicMemory('/tmp');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            tasks: [
                {
                    id: 'routine-1',
                    name: 'Daily Horizon Scan',
                    is_routine: true,
                    frequency: 'daily',
                    prompt: 'Scan horizon',
                    trigger: 'cron',
                    company: 'tenant-a'
                },
                {
                    id: 'routine-2',
                    name: 'Hourly Metric Check',
                    is_routine: true,
                    frequency: 'hourly',
                    prompt: 'Check metrics',
                    trigger: 'cron',
                    company: 'tenant-a'
                },
                {
                    id: 'non-routine-1',
                    name: 'Manual Task',
                    is_routine: false,
                    prompt: 'Do something',
                    trigger: 'cron'
                }
            ]
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should query due routine tasks and execute batch processing', async () => {
        const result = await executeBatchRoutines(episodic, 'tenant-a');

        expect(result.status).toBe('success');
        expect(result.tasks_batched).toBe(2);
        expect(result.successful).toBe(2);
        expect(result.failed).toBe(0);

        const { globalBatchExecutor } = await import('../../src/batch/batch_orchestrator');
        expect(globalBatchExecutor.enqueue).toHaveBeenCalledTimes(2);
        expect(globalBatchExecutor.forceProcess).toHaveBeenCalledTimes(1);
    });

    it('should handle no routine tasks gracefully', async () => {
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            tasks: [
                {
                    id: 'non-routine-1',
                    name: 'Manual Task',
                    is_routine: false,
                    prompt: 'Do something',
                    trigger: 'cron'
                }
            ]
        }));

        const result = await executeBatchRoutines(episodic, 'tenant-a');
        expect(result.status).toBe('success');
        expect(result.tasks_batched).toBe(0);
        expect(result.message).toBe('No routine tasks currently due to batch.');
    });

    it('should filter by company correctly', async () => {
         const result = await executeBatchRoutines(episodic, 'tenant-b');
         // Our mocked readFileSync returns tasks for tenant-a
         expect(result.tasks_batched).toBe(0);
    });
});
