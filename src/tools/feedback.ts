/**
 * Feedback Tool - Solicit human feedback to refine long-term memory
 */
import { z } from 'zod';
import type { Tool } from '../registry.js';
import { FeedbackManager } from '../lib/feedback.js';

export const inputSchema = z.object({
    action: z.enum(['request', 'check']).optional().default('request'),
    question: z.string().optional().describe('The question or preference you want to confirm with the user'),
    category: z.enum(['coding_style', 'architecture', 'workflow', 'general']).optional().default('general'),
});

export const execute = async (args: Record<string, unknown>, cwd: string = process.cwd()): Promise<any> => {
    const { action, question, category } = inputSchema.parse(args);
    const feedbackManager = new FeedbackManager(cwd);

    if (action === 'request') {
        if (!question) throw new Error('Question is required for feedback request.');
        const req = await feedbackManager.requestFeedback(question, category);
        return {
            status: 'requested',
            message: `Feedback requested (ID: ${req.id}). I will continue working. You can check status later or I will be notified when it is resolved.`,
            request: req
        };
    } else if (action === 'check') {
        const pending = await feedbackManager.getPendingRequests();
        const resolved = await feedbackManager.getResolvedRequests();

        // Filter resolved requests that might be relevant (e.g., recent ones)
        // For now, just return all resolved so the agent can see if something it was waiting for is done.

        return {
            pending_count: pending.length,
            pending: pending.map(p => ({ id: p.id, question: p.question })),
            resolved_count: resolved.length,
            resolved: resolved.map(p => ({ id: p.id, question: p.question, response: p.response }))
        };
    }
};

export const tool: Tool = {
    name: 'feedback',
    description: 'Ask the user for long-term preference or architectural decisions asynchronously. Use this when you want to ask a question but keep working on other tasks while waiting for an answer.',
    inputSchema,
    permission: 'write',
    execute: async (args) => execute(args as any),
};
