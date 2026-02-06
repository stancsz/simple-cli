/**
 * Feedback Tool - Enables the "Feedback Loop" for the Frontier Agent
 * Logs user feedback to ~/.simple/guidelines.md and integrates with Host memory.
 */

import { z } from 'zod';
import { appendFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';

export const name = 'feedback';
export const description = 'Submit or solicit feedback. Used for two purposes: 1) "push" feedback to update guidelines/persona guidelines, or 2) "pull" feedback by asking a question.';
export const permission = 'write' as const;

export const inputSchema = z.object({
  action: z.enum(['log', 'ask']).default('log').describe('Whether to log feedback or ask a question'),
  content: z.string().describe('The feedback content or the question to ask'),
  category: z.enum(['coding_style', 'architecture', 'workflow']).optional().default('coding_style'),
});

type FeedbackInput = z.infer<typeof inputSchema>;

export async function execute(args: Record<string, unknown>): Promise<any> {
  const { action, content, category } = inputSchema.parse(args);

  if (action === 'ask') {
      return {
          instruction: "Prompt the user with your question. Once they answer, use feedback tool with action='log' to persist this preference.",
          pending_question: content
      };
  }

  // Action: log
  const home = homedir();
  const simpleDir = join(home, '.simple');
  const guidelinesFile = join(simpleDir, 'guidelines.md');

  if (!existsSync(simpleDir)) {
    await mkdir(simpleDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `- [${timestamp}] [${category}] ${content}\n`;

  try {
    await appendFile(guidelinesFile, entry, 'utf-8');

    // Read back recent guidelines to confirm
    const fileContent = await readFile(guidelinesFile, 'utf-8');
    const lines = fileContent.split('\n').filter(l => l.trim().length > 0);
    const count = lines.length;

    return `Feedback logged successfully to guidelines.md. (Total guidelines: ${count})`;
  } catch (error) {
    throw new Error(`Failed to save feedback: ${error}`);
  }
}

export const tool: Tool = {
  name,
  description,
  inputSchema,
  permission,
  execute: async (args) => execute(args as FeedbackInput),
};
