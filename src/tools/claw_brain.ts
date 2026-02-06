/**
 * ClawBrain - Agentic Reasoning and Persistence for Autonomous Mode
 */
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
    action: z.enum(['set_goal', 'update_status', 'log_reflection', 'create_brief', 'get_summary', 'prune', 'link_files']),
    content: z.string().optional().describe('Text content for the action'),
    status: z.enum(['planning', 'executing', 'completed', 'failed']).optional().describe('Current mission status'),
    links: z.array(z.string()).optional().describe('Paths or IDs to link in the graph'),
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
    const { action, content, status, links } = inputSchema.parse(args);
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
                if (mission.reflections.length > 50) mission.reflections.shift();
                await saveMission(cwd, mission);

                // Write to reflections directory for JIT context
                const reflectionsDir = join(cwd, '.simple/workdir/memory/reflections');
                await mkdir(reflectionsDir, { recursive: true });
                const fileName = `reflection-${Date.now()}.md`;
                await writeFile(join(reflectionsDir, fileName), content);
            }
            return { success: true, added: !!content };

        case 'create_brief':
            if (content) {
                const memoryDir = join(cwd, '.simple/workdir/memory');
                await mkdir(memoryDir, { recursive: true });
                const briefPath = join(memoryDir, 'brief.md');
                await writeFile(briefPath, content);
                return { success: true, path: briefPath };
            }
            return { success: false, message: 'No content provided for brief.' };

        case 'link_files':
            if (links && links.length > 0) {
                const graphDir = join(cwd, '.simple/workdir/memory/graph');
                await mkdir(graphDir, { recursive: true });
                const graphFile = join(graphDir, 'links.jsonl');
                const entry = JSON.stringify({ timestamp: Date.now(), links, goal: mission.goal }) + '\n';
                await writeFile(graphFile, entry, { flag: 'a' });
            }
            return { success: true, linked: links?.length || 0 };

        case 'get_summary':
            return {
                goal: mission.goal,
                status: mission.status,
                recent_reflections: mission.reflections.slice(-5),
                last_updated: new Date(mission.lastUpdated).toISOString()
            };

        case 'prune': {
            const memoryDir = join(cwd, '.simple/workdir/memory');
            const notesDir = join(memoryDir, 'notes');
            await mkdir(notesDir, { recursive: true });

            if (mission.reflections.length === 0) {
                return { success: true, message: 'Nothing to prune.' };
            }

            const archiveFile = join(notesDir, `archive-${Date.now()}.md`);
            let consolidated: string;

            try {
                const { createProvider } = await import('../providers/index.js');
                const provider = createProvider();
                const prompt = `Consolidate and summarize the following mission reflections into a concise technical brief. 
                Keep ONLY unique technical insights, discovered paths, and finalized facts. 
                Original Goal: ${mission.goal}\n\nReflections:\n${mission.reflections.join('\n')}`;

                console.log('🤖 Summarizing reflections for pruning...');
                const summary = await provider.generateResponse('You are a technical documentarian.', [
                    { role: 'user', content: prompt }
                ]);

                let summaryText = summary.message || summary.thought || summary.raw || '';
                try {
                    // Try parsing raw if it looks like JSON and primary fields are empty
                    if (!summaryText && summary.raw && (summary.raw.startsWith('{') || summary.raw.startsWith('['))) {
                        const parsed = JSON.parse(summary.raw);
                        summaryText = parsed.thought || parsed.message || summary.raw;
                    }
                } catch { /* not JSON */ }

                consolidated = [
                    `# Mission Summary Archive: ${mission.goal}`,
                    `Status: ${mission.status}`,
                    `Date: ${new Date().toISOString()}`,
                    '',
                    '## Executive Summary',
                    summaryText
                ].join('\n');
            } catch (e) {
                // Fallback to basic concatenation if LLM fails
                consolidated = mission.reflections.map(r => `- ${r}`).join('\n');
            }

            await writeFile(archiveFile, consolidated);

            mission.reflections = mission.reflections.slice(-3); // Keep only very recent context
            await saveMission(cwd, mission);
            return {
                success: true,
                message: 'Memory pruned and summarized with LLM.',
                archivePath: archiveFile
            };
        }

        default:
            throw new Error(`Invalid action: ${action}`);
    }
};

export const tool: Tool = {
    name: 'claw_brain',
    description: 'Manage autonomous mission state and technical reasoning. Use to set goals, log reflections, and track status.',
    inputSchema,
    permission: 'write',
    execute: async (args) => execute(args as any),
};
