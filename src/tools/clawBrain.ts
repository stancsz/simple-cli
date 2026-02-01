/**
 * ClawBrain - Agentic Reasoning and Persistence for Autonomous Mode
 */
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
    action: z.enum(['set_goal', 'update_status', 'log_reflection', 'get_summary', 'prune']),
    content: z.string().optional().describe('Text content for the action'),
    status: z.enum(['planning', 'executing', 'completed', 'failed']).optional().describe('Current mission status'),
});

type ClawInput = z.infer<typeof inputSchema>;

interface MissionLog {
    goal: string;
    status: string;
    reflections: string[];
    lastUpdated: number;
}

const MISSION_FILE = '.simple/workdir/mission.json';

async function loadMission(cwd: string): Promise<MissionLog> {
    const path = join(cwd, MISSION_FILE);
    if (!existsSync(path)) {
        return { goal: 'Unknown', status: 'planning', reflections: [], lastUpdated: Date.now() };
    }
    try {
        return JSON.parse(await readFile(path, 'utf-8'));
    } catch {
        return { goal: 'Unknown', status: 'planning', reflections: [], lastUpdated: Date.now() };
    }
}

async function saveMission(cwd: string, mission: MissionLog): Promise<void> {
    const path = join(cwd, MISSION_FILE);
    await mkdir(join(cwd, '.simple/workdir'), { recursive: true });
    mission.lastUpdated = Date.now();
    await writeFile(path, JSON.stringify(mission, null, 2));
}

export const execute = async (args: Record<string, unknown>, cwd: string = process.cwd()): Promise<any> => {
    const { action, content, status } = inputSchema.parse(args);
    const mission = await loadMission(cwd);

    switch (action) {
        case 'set_goal':
            mission.goal = content || mission.goal;
            if (status) mission.status = status;
            await saveMission(cwd, mission);
            return { success: true, message: `Goal set to: ${mission.goal}` };

        case 'update_status':
            if (status) mission.status = status;
            if (content) mission.reflections.push(`[Status Update] ${content}`);
            await saveMission(cwd, mission);
            return { success: true, status: mission.status };

        case 'log_reflection':
            if (content) {
                mission.reflections.push(content);
                if (mission.reflections.length > 20) mission.reflections.shift(); // Keep it lean
                await saveMission(cwd, mission);
            }
            return { success: true, added: !!content };

        case 'get_summary':
            return {
                goal: mission.goal,
                status: mission.status,
                recent_reflections: mission.reflections.slice(-5),
                last_updated: new Date(mission.lastUpdated).toISOString()
            };

        case 'prune':
            mission.reflections = mission.reflections.slice(-3); // Keep only very recent context
            await saveMission(cwd, mission);
            return { success: true, message: 'Memory pruned to keep context window clean.' };

        default:
            throw new Error(`Invalid action: ${action}`);
    }
};

export const tool: Tool = {
    name: 'clawBrain',
    description: 'Manage autonomous mission state and technical reasoning. Use to set goals, log reflections, and track status.',
    inputSchema,
    permission: 'write',
    execute: async (args) => execute(args as any),
};
