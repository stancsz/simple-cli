/**
 * Tool: scheduler
 * Manage Ghost Tasks (scheduled executions) using crontab or schtasks
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import { z } from 'zod';
import { resolve, join } from 'path';

export const name = 'scheduler';

export const description = 'Schedule a task to run automatically at intervals. CRITICAL for fulfilling "Every X minutes" or "Every day" intents. Tasks run in --ghost mode.';

export const permission = 'execute' as const;

export const schema = z.object({
    intent: z.string().describe('The task description/intent to execute'),
    schedule: z.string().describe('Cron expression (e.g. "0 * * * *") or interval in minutes'),
    name: z.string().optional().describe('Unique name for the task'),
    targetDir: z.string().optional().describe('Working directory for the task')
});

export const execute = async (args: Record<string, unknown>): Promise<string> => {
    const { intent, schedule, name: taskName, targetDir } = schema.parse(args);
    const isWindows = platform() === 'win32';
    const cwd = resolve(targetDir || process.cwd());
    const id = taskName || `ghost-${Date.now()}`;

    // Path to simple-cli. We assume it's installed globally or use the current one.
    // For local dev, we use the absolute path to dist/cli.js
    const cliPath = resolve(join(process.cwd(), 'dist', 'cli.js'));
    const command = `node "${cliPath}" "${cwd}" -claw "${intent}" --ghost --yolo`;

    try {
        if (isWindows) {
            const interval = parseInt(schedule) || 60;
            const escapedCommand = command.replace(/"/g, '\\"');
            try {
                execSync(`schtasks /create /sc minute /mo ${interval} /tn "${id}" /tr "${escapedCommand}" /f`);
                return `Task scheduled on Windows: ${id} Every ${interval} minutes.`;
            } catch (e: any) {
                return `Error scheduling on Windows: ${e.message}`;
            }
        } else {
            try {
                // Determine cron expression
                let cronExpr = schedule;
                if (!schedule.includes('*')) {
                    const mins = parseInt(schedule) || 60;
                    cronExpr = `*/${mins} * * * *`;
                }

                const cronEntry = `${cronExpr} ${command} # ${id}`;
                let currentCron = '';
                try {
                    currentCron = execSync('crontab -l', { encoding: 'utf-8' });
                } catch (e) { /* ignore empty crontab */ }

                const newCron = currentCron.trim() + '\n' + cronEntry + '\n';
                execSync(`echo "${newCron}" | crontab -`);
                return `Task scheduled on Linux/Mac: ${id} with schedule ${cronExpr}`;
            } catch (e: any) {
                return `Error scheduling on Linux/Mac: ${e.message}`;
            }
        }
    } catch (error) {
        throw new Error(`Failed to schedule task: ${error instanceof Error ? error.message : error}`);
    }
};
