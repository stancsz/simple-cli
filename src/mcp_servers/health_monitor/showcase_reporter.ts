import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';

export interface ShowcaseStep {
    name: string;
    status: 'success' | 'failure' | 'skipped';
    duration_ms?: number;
    details?: string;
}

export interface ShowcaseRun {
    id: string;
    timestamp: string;
    success: boolean;
    total_duration_ms: number;
    steps: ShowcaseStep[];
    artifact_count: number;
    error?: string;
}

const SHOWCASE_RUNS_FILE = join(process.cwd(), '.agent', 'health_monitor', 'showcase_runs.json');

export async function saveShowcaseRun(run: ShowcaseRun): Promise<void> {
    const dir = dirname(SHOWCASE_RUNS_FILE);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    let runs: ShowcaseRun[] = [];
    if (existsSync(SHOWCASE_RUNS_FILE)) {
        try {
            const content = await readFile(SHOWCASE_RUNS_FILE, 'utf-8');
            runs = JSON.parse(content);
        } catch (e) {
            console.warn("Failed to parse existing showcase runs, starting fresh.", e);
        }
    }

    runs.push(run);
    // Keep only last 50 runs to avoid infinite growth
    if (runs.length > 50) {
        runs = runs.slice(runs.length - 50);
    }

    await writeFile(SHOWCASE_RUNS_FILE, JSON.stringify(runs, null, 2));
}

export async function getShowcaseRuns(limit: number = 7): Promise<ShowcaseRun[]> {
    if (!existsSync(SHOWCASE_RUNS_FILE)) {
        return [];
    }
    try {
        const content = await readFile(SHOWCASE_RUNS_FILE, 'utf-8');
        const runs: ShowcaseRun[] = JSON.parse(content);
        return runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
    } catch (e) {
        console.error("Failed to read showcase runs:", e);
        return [];
    }
}
