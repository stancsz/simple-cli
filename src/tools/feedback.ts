/**
 * Feedback Tool - Solicit human feedback to refine long-term memory
 */
import { z } from 'zod';
import type { Tool } from '../registry.js';
import { execute as hostExecute } from './host.js';

export const inputSchema = z.object({
    question: z.string().describe('The question or preference you want to confirm with the user'),
    category: z.enum(['coding_style', 'architecture', 'workflow']).optional().default('coding_style'),
});

export const execute = async (args: Record<string, unknown>): Promise<any> => {
    const { question, category } = inputSchema.parse(args);

    // In TUI mode, this would prompt the user.
    // In headless mode, it might just return a "Wait for feedback" state.
    // For now, since we are a CLI, we return the instruction for the agent to use 'host'
    // to store the answer once received.

    return {
        instruction: "Prompt the user with your question. Once they answer, use the 'host' tool with action: 'learn' and category: 'user_fact' to persist this preference forever.",
        pending_question: question
    };
};

export const tool: Tool = {
    name: 'feedback',
    description: 'Ask the user for long-term preference or architectural decisions. Use this when you are unsure about a pattern and want to "learn" the correct way for future sessions.',
    inputSchema,
    permission: 'read',
    execute
};
