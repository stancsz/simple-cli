/**
 * Feedback Tool - Enables the "Feedback Loop" for the Frontier Agent
 * Logs user feedback to ~/.simple/guidelines.md for future reference.
 */

import { z } from 'zod';
import { appendFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';

export const name = 'feedback_tool';
export const description = 'Submit feedback to the agent. The agent will learn from this feedback by updating its internal guidelines. Use this when the agent makes a mistake or needs course correction.';
export const permission = 'write' as const;

export const inputSchema = z.object({
  feedback: z.string().describe('The feedback or correction to be learned.'),
});

type FeedbackInput = z.infer<typeof inputSchema>;

export async function execute(args: Record<string, unknown>): Promise<string> {
  const { feedback } = inputSchema.parse(args);

  const home = homedir();
  const simpleDir = join(home, '.simple');
  const guidelinesFile = join(simpleDir, 'guidelines.md');

  if (!existsSync(simpleDir)) {
    await mkdir(simpleDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `- [${timestamp}] ${feedback}\n`;

  try {
    await appendFile(guidelinesFile, entry, 'utf-8');

    // Read back recent guidelines to confirm
    const content = await readFile(guidelinesFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const count = lines.length;

    return `Feedback logged successfully. I have updated my guidelines. (Total guidelines: ${count})`;
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
