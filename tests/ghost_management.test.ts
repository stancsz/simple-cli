import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as management from '../src/claw/management.js';
import * as child_process from 'child_process';
import * as fs from 'fs/promises';
import { platform } from 'os';

vi.mock('child_process');
vi.mock('fs/promises');

describe('Ghost Management', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('killGhostTask should remove task from crontab on Linux', async () => {
        // Mock platform to return linux (default usually, but being explicit if I could mock os.platform)
        // Since I can't easily mock os.platform in ESM without more setup, I'll rely on the fact that the code checks for win32.

        const execSyncMock = vi.mocked(child_process.execSync);

        // Mock existing crontab
        const currentCron = '*/5 * * * * simple task # task-1\n*/10 * * * * simple task # task-2';
        execSyncMock.mockReturnValueOnce(currentCron); // for crontab -l

        await management.killGhostTask('task-1');

        // Should call crontab -l
        expect(execSyncMock).toHaveBeenCalledWith('crontab -l');

        // Should call crontab - with new content
        const expectedCron = '*/10 * * * * simple task # task-2';
        // The implementation calls: execSync(`echo "${newCron}" | crontab -`);
        // We verify the second call
        const lastCall = execSyncMock.mock.calls[1];
        expect(lastCall[0]).toContain('echo "');
        expect(lastCall[0]).toContain(expectedCron);
        expect(lastCall[0]).toContain('| crontab -');
    });

    it('showGhostLogs should read from the correct directory', async () => {
        const readdirMock = vi.mocked(fs.readdir);
        const readFileMock = vi.mocked(fs.readFile);

        readdirMock.mockResolvedValue(['ghost-123.log', 'ghost-456.log'] as any);
        readFileMock.mockResolvedValue('Log content');

        // Mock console.log to avoid clutter
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await management.showGhostLogs('ghost-123');

        expect(readdirMock).toHaveBeenCalledWith('.simple/workdir/memory/logs');
        expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('ghost-123.log'), 'utf-8');

        consoleSpy.mockRestore();
    });
});
