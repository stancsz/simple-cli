import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export const tool = {
  name: 'openclaw_message',
  description: 'Send a message via OpenClaw to supported channels (WhatsApp, Slack, Telegram, etc.)',
  inputSchema: z.object({
    to: z.string().describe('Recipient (phone number, channel ID, or group ID)'),
    message: z.string().describe('Message content')
  }),
  execute: async ({ to, message }) => {
    try {
      const { stdout, stderr } = await execAsync(`openclaw message send --to "${to}" --message "${message.replace(/"/g, '\\"')}"`);
      return stdout.trim();
    } catch (e) {
      return `Error sending message: ${e.message}. Stderr: ${e.stderr || ''}`;
    }
  }
};
