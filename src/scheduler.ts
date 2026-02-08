import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface ScheduledTask {
    id: string;
    cron: string;
    prompt: string;
    description: string;
    lastRun: number; // timestamp
    enabled: boolean;
    failureCount: number;
}

export class Scheduler {
    private static instance: Scheduler;
    private tasks: ScheduledTask[] = [];
    private filePath: string;

    private constructor(cwd: string) {
        this.filePath = join(cwd, '.agent', 'scheduler.json');
    }

    public static getInstance(cwd: string = process.cwd()): Scheduler {
        if (!Scheduler.instance) {
            Scheduler.instance = new Scheduler(cwd);
        }
        return Scheduler.instance;
    }

    async load() {
        if (existsSync(this.filePath)) {
            try {
                const content = await readFile(this.filePath, 'utf-8');
                this.tasks = JSON.parse(content);
            } catch (e) {
                console.error('Failed to load scheduler config:', e);
                this.tasks = [];
            }
        } else {
            this.tasks = [];
        }
    }

    async save() {
        try {
            const dir = dirname(this.filePath);
            if (!existsSync(dir)) {
                await mkdir(dir, { recursive: true });
            }
            await writeFile(this.filePath, JSON.stringify(this.tasks, null, 2));
        } catch (e) {
            console.error('Failed to save scheduler config:', e);
        }
    }

    async scheduleTask(cron: string, prompt: string, description: string) {
        await this.load();
        const id = Math.random().toString(36).substring(2, 9);
        this.tasks.push({
            id,
            cron,
            prompt,
            description,
            lastRun: Date.now(), // Set to now to avoid immediate catch-up
            enabled: true,
            failureCount: 0
        });
        await this.save();
        return id;
    }

    async getDueTasks(): Promise<ScheduledTask[]> {
        await this.load();
        const now = new Date();
        const due: ScheduledTask[] = [];

        for (const task of this.tasks) {
            if (!task.enabled) continue;

            // Check catch-up (max 24h back)
            if (this.shouldRun(task, now)) {
                due.push(task);
            }
        }
        return due;
    }

    private shouldRun(task: ScheduledTask, now: Date): boolean {
        // Start checking from lastRun + 1 minute
        let cursor = new Date(task.lastRun + 60000);

        // Safety: don't check more than 24 hours back
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (cursor < cutoff) cursor = cutoff;

        // Align cursor to seconds 0
        cursor.setSeconds(0, 0);

        // Iterate minute by minute up to now
        while (cursor <= now) {
            if (this.matchCron(task.cron, cursor)) {
                return true;
            }
            cursor = new Date(cursor.getTime() + 60000);
        }

        return false;
    }

    private matchCron(cron: string, date: Date): boolean {
        const parts = cron.split(/\s+/);
        if (parts.length < 5) return false;

        const [min, hour, day, month, dayWeek] = parts;

        const check = (val: string, current: number): boolean => {
            if (val === '*') return true;

            // Handle lists: 1,2,3
            if (val.includes(',')) {
                return val.split(',').some(v => check(v, current));
            }

            // Handle steps: */5 or 1-10/2
            if (val.includes('/')) {
                const [base, step] = val.split('/');
                const stepNum = parseInt(step);
                if (isNaN(stepNum)) return false;

                if (base === '*') return current % stepNum === 0;
                // Treat range with step later if needed, simple */n is most common
                return check(base, current) && (current % stepNum === 0);
            }

            // Handle ranges: 1-5
            if (val.includes('-')) {
                const [start, end] = val.split('-').map(Number);
                return current >= start && current <= end;
            }

            return parseInt(val) === current;
        };

        return check(min, date.getMinutes()) &&
               check(hour, date.getHours()) &&
               check(day, date.getDate()) &&
               check(month, date.getMonth() + 1) &&
               check(dayWeek, date.getDay());
    }

    async markTaskRun(id: string, success: boolean) {
        await this.load();
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.lastRun = Date.now();
            if (!success) {
                task.failureCount++;
                // Spec: "If a task fails ... 3 times in a row, the Audit process will flagged it."
                // For now, we just track it.
            } else {
                task.failureCount = 0;
            }
            await this.save();
        }
    }
}
