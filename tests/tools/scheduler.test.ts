
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSchedule, execute } from '../../src/tools/scheduler.js';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';

vi.mock('child_process');
vi.mock('os');
vi.mock('fs');

describe('Scheduler Tool', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(os.platform).mockReturnValue('linux');
        // Ensure fs.existsSync returns true so CLI path resolution works
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    describe('parseSchedule', () => {
        it('should return cron expression as is', () => {
            expect(parseSchedule('*/5 * * * *')).toBe('*/5 * * * *');
            expect(parseSchedule('0 12 * * 1-5')).toBe('0 12 * * 1-5');
        });

        it('should handle numeric input as minutes', () => {
            expect(parseSchedule('5')).toBe('*/5 * * * *');
            expect(parseSchedule('15')).toBe('*/15 * * * *');
        });

        it('should handle natural language shortcuts', () => {
            expect(parseSchedule('hourly')).toBe('0 * * * *');
            expect(parseSchedule('daily')).toBe('0 0 * * *');
            expect(parseSchedule('midnight')).toBe('0 0 * * *');
            expect(parseSchedule('weekly')).toBe('0 0 * * 0');
        });

        it('should handle "every X minutes"', () => {
            expect(parseSchedule('every 10 minutes')).toBe('*/10 * * * *');
            expect(parseSchedule('Every 5 mins')).toBe('*/5 * * * *');
            expect(parseSchedule('every 1 minute')).toBe('*/1 * * * *');
        });

        it('should handle "every X hours"', () => {
            expect(parseSchedule('every 2 hours')).toBe('0 */2 * * *');
            expect(parseSchedule('every 4 hrs')).toBe('0 */4 * * *');
        });

        it('should fallback to hourly for unknown', () => {
             expect(parseSchedule('some random string')).toBe('0 * * * *');
        });
    });

    describe('execute', () => {
        it('should schedule on Linux/Mac', async () => {
             vi.mocked(cp.execSync).mockReturnValue(''); // crontab -l returns empty

             await execute({
                 intent: 'echo hello',
                 schedule: 'every 10 minutes',
                 name: 'test-task',
                 targetDir: '/tmp'
             });

             // Should call crontab -l
             expect(cp.execSync).toHaveBeenCalledWith('crontab -l', expect.anything());

             // Check the echo call
             const calls = vi.mocked(cp.execSync).mock.calls;
             const echoCall = calls.find(c => String(c[0]).startsWith('echo'));
             expect(echoCall).toBeTruthy();
             const cmd = String(echoCall![0]);

             expect(cmd).toContain('*/10 * * * *');
             expect(cmd).toContain('# test-task');
             expect(cmd).toContain('| crontab -');
             expect(cmd).toContain('node "');
        });

        it('should replace existing task on Linux/Mac', async () => {
            // crontab -l returns existing task
            vi.mocked(cp.execSync).mockReturnValue('*/5 * * * * old command # test-task\n');

            await execute({
                intent: 'new command',
                schedule: 'every 10 minutes',
                name: 'test-task',
                targetDir: '/tmp'
            });

            const calls = vi.mocked(cp.execSync).mock.calls;
            const echoCall = calls.find(c => String(c[0]).startsWith('echo'));
            const cmd = String(echoCall![0]);

            expect(cmd).not.toContain('old command');
            expect(cmd).toContain('new command');
       });

        it('should schedule on Windows (minutes)', async () => {
            vi.mocked(os.platform).mockReturnValue('win32');

            await execute({
                 intent: 'echo hello',
                 schedule: 'every 10 minutes',
                 name: 'test-task-win',
                 targetDir: 'C:\\tmp'
             });

             const calls = vi.mocked(cp.execSync).mock.calls;
             const schCall = calls.find(c => String(c[0]).startsWith('schtasks'));
             expect(schCall).toBeTruthy();
             const cmd = String(schCall![0]);

             expect(cmd).toContain('/sc minute');
             expect(cmd).toContain('/mo 10');
             expect(cmd).toContain('/tn "test-task-win"');
        });

        it('should schedule "daily" on Windows', async () => {
            vi.mocked(os.platform).mockReturnValue('win32');

            await execute({
                 intent: 'cleanup',
                 schedule: 'daily',
                 name: 'test-daily-win',
                 targetDir: 'C:\\tmp'
             });

             const calls = vi.mocked(cp.execSync).mock.calls;
             const schCall = calls.find(c => String(c[0]).startsWith('schtasks'));
             expect(schCall).toBeTruthy();
             const cmd = String(schCall![0]);

             expect(cmd).toContain('/sc daily');
             expect(cmd).toContain('/mo 1');
        });

        it('should schedule "every 2 hours" on Windows', async () => {
            vi.mocked(os.platform).mockReturnValue('win32');

            await execute({
                 intent: 'cleanup',
                 schedule: 'every 2 hours',
                 name: 'test-hourly-win',
                 targetDir: 'C:\\tmp'
             });

             const calls = vi.mocked(cp.execSync).mock.calls;
             const schCall = calls.find(c => String(c[0]).startsWith('schtasks'));
             expect(schCall).toBeTruthy();
             const cmd = String(schCall![0]);

             expect(cmd).toContain('/sc hourly');
             expect(cmd).toContain('/mo 2');
        });
    });
});
