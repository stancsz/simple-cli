/**
 * Tool: reloadTools
 * Reloads all tools, including built-in, MCP, and project-specific skills.
 * Use this after creating a new skill file in the 'skills/' directory.
 */

import { z } from 'zod';
import { getContextManager } from '../context.js';

export const name = 'reload_tools';

export const description = 'Reload all tools to pick up new skills or changes to existing tools';

export const permission = 'read' as const;

export const schema = z.object({});

export const execute = async (_args: Record<string, unknown>): Promise<string> => {
    const ctx = getContextManager();
    await ctx.initialize();

    const tools = ctx.getTools();
    const summary = Array.from(tools.values()).reduce((acc, tool) => {
        const source = tool.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return `All tools reloaded successfully.\n\nSummary:\n- Built-in: ${summary.builtin || 0}\n- Project Skills: ${summary.project || 0}\n- MCP Tools: ${summary.mcp || 0}\n\nNewly discovered/updated tools are now ready for use.`;
};
