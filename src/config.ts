import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface AgentConfig {
    command: string;
    args: string[];
    description: string;
    supports_stdin?: boolean;
    env?: Record<string, string>;
    context_flag?: string;
}

export interface TaskConfig {
    id: string;
    cron: string;
    command: string; // The command or prompt to execute
    description: string;
    enabled?: boolean;
}

export interface SchedulerConfig {
    enabled: boolean;
    tasks: TaskConfig[];
}

export interface Config {
    mcpServers?: Record<string, any>;
    agents?: Record<string, AgentConfig>;
    scheduler?: SchedulerConfig;
    yoloMode?: boolean;
    autoDecisionTimeout?: number;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
    const locations = [
        join(cwd, 'mcp.json'),
        join(cwd, '.agent', 'config.json')
    ];

    for (const loc of locations) {
        if (existsSync(loc)) {
            try {
                const content = await readFile(loc, 'utf-8');
                return JSON.parse(content);
            } catch (e) {
                console.error(`Failed to parse config at ${loc}:`, e);
            }
        }
    }

    return {};
}
