import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const claw = {
    name: 'claw',
    description: 'Interact with Open Claw (agent, skills, etc.)',
    inputSchema: z.object({
        action: z.enum(['agent', 'list_skills', 'inspect_skill']).describe('Action to perform'),
        message: z.string().optional().describe('Message for the agent (required for action=agent)'),
        skill_name: z.string().optional().describe('Name of the skill to inspect')
    }),
    execute: async ({ action, message, skill_name }: { action: string, message?: string, skill_name?: string }) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'npx.cmd' : 'npx';

        try {
            if (action === 'agent') {
                if (!message) return 'Error: message is required for agent action';
                const args = ['openclaw', 'agent', '--local', '--json', '--session-id', 'simple-cli-claw-tool', '--message', message];
                const { stdout, stderr } = await execFileAsync(cmd, args);
                return stdout || stderr;
            }
            if (action === 'list_skills') {
                const args = ['openclaw', 'skills', 'list'];
                const { stdout } = await execFileAsync(cmd, args);
                return stdout;
            }
            if (action === 'inspect_skill') {
                if (!skill_name) return 'Error: skill_name is required for inspect_skill';
                const args = ['openclaw', 'skills', 'info', skill_name];
                const { stdout } = await execFileAsync(cmd, args);
                return stdout;
            }
            return 'Unknown action';
        } catch (e: any) {
            return `Error executing claw ${action}: ${e.message}\n${e.stderr || ''}`;
        }
    }
};
