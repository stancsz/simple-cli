/**
 * Tool: scheduler
 * Manage Ghost Tasks (scheduled executions) using crontab or schtasks
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import { z } from 'zod';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

export const name = 'scheduler';

export const description = 'Schedule a task to run automatically at intervals. CRITICAL for fulfilling "Every X minutes" or "Every day" intents. Tasks run in --ghost mode.';

export const permission = 'execute' as const;

export const schema = z.object({
    intent: z.string().describe('The task description/intent to execute'),
    schedule: z.string().describe('Cron expression (e.g. "0 * * * *") or interval in minutes'),
    name: z.string().optional().describe('Unique name for the task'),
    targetDir: z.string().optional().describe('Working directory for the task')
});

export function parseSchedule(schedule: string): string {
    const lower = schedule.toLowerCase().trim();

    // 1. Direct Cron expression (basic check: contains 4 spaces, or 5 parts)
    if (schedule.trim().split(/\s+/).length >= 5) return schedule;

    // 2. Numeric (assume minutes)
    if (/^\d+$/.test(schedule)) {
        return `*/${schedule} * * * *`;
    }

    // 3. Natural Language Shortcuts
    if (lower === 'hourly' || lower === 'every hour') return '0 * * * *';
    if (lower === 'daily' || lower === 'every day' || lower === 'midnight') return '0 0 * * *';
    if (lower === 'weekly' || lower === 'every week') return '0 0 * * 0';
    if (lower === 'monthly' || lower === 'every month') return '0 0 1 * *';

    // 4. "Every X minutes"
    const minMatch = lower.match(/every (\d+) (minute|min)s?/);
    if (minMatch) {
        return `*/${minMatch[1]} * * * *`;
    }

    // 5. "Every X hours"
    const hourMatch = lower.match(/every (\d+) (hour|hr)s?/);
    if (hourMatch) {
        return `0 */${hourMatch[1]} * * *`;
    }

    // Default fallback to hourly if parsing fails but input is non-empty
    // Try parseInt as a last resort fallback for "10" (handled by regex above but maybe "10 " with space)
    const num = parseInt(schedule);
    if (!isNaN(num) && num > 0) {
        return `*/${num} * * * *`;
    }

    return '0 * * * *'; // Default to hourly
}

export const execute = async (args: Record<string, unknown>): Promise<string> => {
    const { intent, schedule, name: taskName, targetDir } = schema.parse(args);
    const isWindows = platform() === 'win32';
    const cwd = resolve(targetDir || process.cwd());
    const id = taskName || `ghost-${Date.now()}`;

    // Resolve CLI path robustly
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Check if we are in dist or src
    let cliPath = resolve(__dirname, '../cli.js'); // Default for dist/tools -> dist/cli.js
    if (!fs.existsSync(cliPath)) {
        // Try src/cli.ts (dev mode)
        // But running TS directly via node requires loader.
        // For scheduling, we prefer the built JS if available.
        // If not, we fall back to assuming dist will exist or checking specific locations.
        const distPath = resolve(__dirname, '../../dist/cli.js');
        if (fs.existsSync(distPath)) {
            cliPath = distPath;
        } else {
             // Fallback to what was there, or relative to process.cwd() which might be flaky
             cliPath = resolve(join(process.cwd(), 'dist', 'cli.js'));
        }
    }

    const command = `node "${cliPath}" "${cwd}" -claw "${intent}" --ghost --yolo`;

    try {
        if (isWindows) {
            const cron = parseSchedule(schedule);
            let sc = 'minute';
            let mo = '60';

            // Exact matches first
            if (cron === '0 0 * * *') { // Daily
                sc = 'daily';
                mo = '1';
            } else if (cron === '0 0 * * 0') { // Weekly
                sc = 'weekly';
                mo = '1';
            } else if (cron === '0 0 1 * *') { // Monthly
                 sc = 'monthly';
                 mo = '1';
            } else if (cron === '0 * * * *') { // Hourly
                sc = 'hourly';
                mo = '1';
            } else {
                // Patterns
                const minMatch = cron.match(/^\*\/(\d+) \* \* \* \*$/);
                const hourMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/);

                if (minMatch) {
                    sc = 'minute';
                    mo = minMatch[1];
                } else if (hourMatch) {
                    sc = 'hourly';
                    mo = hourMatch[1];
                } else {
                    // Complex cron not supported on Windows simple mapping
                    // Default to hourly
                    sc = 'hourly';
                    mo = '1';
                }
            }

            const escapedCommand = command.replace(/"/g, '\\"');
            try {
                execSync(`schtasks /create /sc ${sc} /mo ${mo} /tn "${id}" /tr "${escapedCommand}" /f`);
                return `Task scheduled on Windows: ${id} (${sc} every ${mo})`;
            } catch (e: any) {
                return `Error scheduling on Windows: ${e.message}`;
            }
        } else {
            try {
                const cronExpr = parseSchedule(schedule);
                const cronEntry = `${cronExpr} ${command} # ${id}`;
                let currentCron = '';
                try {
                    currentCron = execSync('crontab -l', { encoding: 'utf-8' });
                } catch (e) { /* ignore empty crontab */ }

                // Check if task with same ID exists and replace/append
                const newCronLines = currentCron.split('\n').filter(line => {
                    const trimmed = line.trim();
                    return trimmed && !trimmed.endsWith(`# ${id}`);
                });

                newCronLines.push(cronEntry);
                const newCron = newCronLines.join('\n') + '\n';

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
