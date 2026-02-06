import { z } from 'zod';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
  feedback: z.string().describe('The guideline or preference to learn.'),
});

type FeedbackInput = z.infer<typeof inputSchema>;

const GUIDELINES_FILE = join(homedir(), '.simple', 'guidelines.md');

export async function execute(input: FeedbackInput): Promise<string> {
  const { feedback } = inputSchema.parse(input);

  if (!feedback.trim()) {
    return 'Error: Feedback cannot be empty.';
  }

  // Ensure directory exists
  const dir = dirname(GUIDELINES_FILE);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `- [${timestamp}] ${feedback.trim()}\n`;

  try {
    await appendFile(GUIDELINES_FILE, entry);
    return `Feedback recorded. I will remember this guideline: "${feedback.trim()}"`;
  } catch (error) {
    return `Error saving feedback: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const tool: Tool = {
  name: 'feedback',
  description: 'Provide feedback to the agent. Use this to teach the agent permanent guidelines or preferences that it should always follow (e.g., "Always use semicolons", "Prefer functional programming").',
  inputSchema,
  permission: 'write',
  execute: async (args) => execute(args as FeedbackInput),
};
