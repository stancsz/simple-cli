import { describe, it, expect, vi } from 'vitest';
import { handleTaskTrigger } from '../../src/scheduler/trigger.js';
import { spawn } from 'child_process';
import { join } from 'path';

vi.mock('child_process', () => ({
    spawn: vi.fn(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
            if (event === 'close') cb(0);
        })
    }))
}));

describe('Trigger', () => {
    it('should spawn custom script if provided', async () => {
        const task = {
            id: 'test',
            name: 'Test',
            trigger: 'cron' as const,
            prompt: 'Run',
            script: 'src/myscript.ts'
        };

        await handleTaskTrigger(task);

        expect(spawn).toHaveBeenCalledWith(
            'node',
            expect.arrayContaining([expect.stringContaining('src/myscript.ts')]),
            expect.any(Object)
        );
    });
});
