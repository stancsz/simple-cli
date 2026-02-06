import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';
import { getContextManager } from '../context.js';

export const inputSchema = z.object({
    sentiment: z.enum(['confident', 'stuck', 'exploring', 'cautious']).describe('Current feeling about the progress'),
    summary: z.string().describe('Brief summary of what has been accomplished so far'),
    blockers: z.string().optional().describe('Any blocking issues'),
    next_steps: z.string().describe('Immediate next steps')
});

export const execute = async (args: Record<string, unknown>, cwd: string = process.cwd()): Promise<any> => {
    const { sentiment, summary, blockers, next_steps } = inputSchema.parse(args);
    const context = getContextManager(cwd);
    const state = context.getState();

    const snapshotDir = join(cwd, '.simple', 'snapshots');
    if (!existsSync(snapshotDir)) {
        await mkdir(snapshotDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vibe_check_${timestamp}.md`;
    const filepath = join(snapshotDir, filename);

    const activeFiles = Array.from(state.activeFiles).map(f => f.replace(cwd + '/', ''));

    const report = `
# 📸 Project Vibe Check
**Date:** ${new Date().toLocaleString()}
**Sentiment:** ${sentiment.toUpperCase()}

## 📝 Status Summary
${summary}

${blockers ? `## 🚧 Blockers\n${blockers}\n` : ''}

## 👣 Next Steps
${next_steps}

## 📂 Context State
**Active Files:**
${activeFiles.map(f => `- ${f}`).join('\n') || 'None'}

**Token Estimate:** ~${await context.estimateTokenCount()}

## 📜 Recent History (Last 5 Messages)
${state.history.slice(-5).map(m => `**${m.role.toUpperCase()}:** ${m.content.substring(0, 100)}...`).join('\n\n')}
    `.trim();

    await writeFile(filepath, report);

    return {
        success: true,
        message: `Snapshot created at ${filename}`,
        path: filepath
    };
};

export const tool: Tool = {
    name: 'snapshot',
    description: 'Create a "Vibe Check" snapshot of the current project state. Use this to periodically document progress, sentiment, and blockers for human review.',
    inputSchema,
    permission: 'write',
    execute: async (args) => execute(args as any),
};
