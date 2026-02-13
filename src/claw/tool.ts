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
        skill_name: z.string().optional().describe('Name of the skill to inspect'),
        session_id: z.string().optional().describe('Custom session ID for the agent'),
        agent_id: z.string().optional().describe('Specific agent ID to use (e.g. openai-agent)')
    }),
    execute: async ({ action, message, skill_name, session_id, agent_id }: { action: string, message?: string, skill_name?: string, session_id?: string, agent_id?: string }) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'npx.cmd' : 'npx';

        try {
            if (action === 'agent') {
                if (!message) return 'Error: message is required for agent action';
                const sId = session_id || `simple-cli-claw-tool-${Date.now()}`;
                const args = ['openclaw', 'agent', '--local', '--json', '--session-id', sId, '--message', message];
                if (agent_id) {
                    args.push('--agent', agent_id);
                }
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
