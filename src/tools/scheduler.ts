/**
 * Tool: scheduler
 * Schedule recurring tasks or one-time delayed commands.
 * [Simple-CLI AI-Created]
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import { platform } from 'os';

export const name = 'scheduler';

export const description = 'Schedule a task to run at a specific interval or time.';

export const permission = 'execute' as const;

export const schema = z.object({
    action: z.enum(['create', 'list', 'delete']).describe('Operation to perform'),
    taskName: z.string().describe('Unique name for the task'),
    command: z.string().optional().describe('Command to execute (required for create)'),
    interval: z.string().optional().describe('Interval (e.g., "1h", "daily", "weekly") - Windows format: "HOURLY", "DAILY", etc.'),
    time: z.string().optional().describe('Specific time for the task (HH:mm)')
});

export const execute = async (args: Record<string, unknown>) => {
    const parsed = schema.parse(args);
    const isWindows = platform() === 'win32';

    switch (parsed.action) {
        case 'create':
            if (!parsed.command) throw new Error('command is required for create action');
            if (isWindows) {
                return createWindowsTask(parsed.taskName, parsed.command, parsed.interval || 'HOURLY');
            } else {
                return createUnixCron(parsed.taskName, parsed.command, parsed.interval || '1h');
            }
        case 'list':
            if (isWindows) {
                return execSync('schtasks /query /fo LIST', { encoding: 'utf-8' });
            } else {
                return execSync('crontab -l', { encoding: 'utf-8' });
            }
        case 'delete':
            if (isWindows) {
                return execSync(`schtasks /delete /tn "${parsed.taskName}" /f`, { encoding: 'utf-8' });
            } else {
                // Crontab deletion is more complex, for now just a mockup or simple grep -v
                return 'Crontab deletion not fully implemented in this demo.';
            }
    }
};

function createWindowsTask(name: string, command: string, interval: string) {
    // Simplistic Windows schtasks wrapper
    const sc = interval.toUpperCase() === '1H' ? 'HOURLY' : interval.toUpperCase();
    const cmd = `schtasks /create /sc ${sc} /tn "${name}" /tr "${command.replace(/"/g, '\\"')}" /f`;
    try {
        const output = execSync(cmd, { encoding: 'utf-8' });
        return `Task "${name}" created successfully on Windows.\n${output}`;
    } catch (e: any) {
        return `Failed to create Windows task: ${e.stderr || e.message}`;
    }
}

function createUnixCron(name: string, command: string, interval: string) {
    // Simplistic cron wrapper
    let cronInterval = '0 * * * *'; // Hourly default
    if (interval === 'daily') cronInterval = '0 0 * * *';

    const cronLine = `${cronInterval} ${command} # ${name}`;
    try {
        execSync(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`, { encoding: 'utf-8' });
        return `Task "${name}" added to crontab.`;
    } catch (e: any) {
        return `Failed to add to crontab: ${e.message}`;
    }
}
