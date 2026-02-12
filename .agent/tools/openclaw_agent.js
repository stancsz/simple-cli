import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export const tool = {
  name: 'openclaw_agent',
  description: 'Delegate a task to the OpenClaw AI Assistant. Use this for complex tasks requiring conversation, browsing, or multi-step reasoning.',
  inputSchema: z.object({
    message: z.string().describe('The task or message for the agent'),
    thinking: z.enum(['off', 'low', 'medium', 'high']).default('high').describe('The level of thinking/reasoning required')
  }),
  execute: async ({ message, thinking }) => {
    try {
      const { stdout, stderr } = await execAsync(`openclaw agent --message "${message.replace(/"/g, '\\"')}" --thinking ${thinking}`);
      return stdout.trim();
    } catch (e) {
      return `Error executing agent task: ${e.message}. Stderr: ${e.stderr || ''}`;
    }
  }
};
