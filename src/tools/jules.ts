import { Tool } from '../registry.js';
import { z } from 'zod';

const API_KEY = process.env.JULES_API_KEY;
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export const inputSchema = z.object({
  action: z.enum(['list_sources', 'start_session', 'check_status']).describe('Action to perform'),
  source: z.string().optional().describe('Source name for start_session (e.g. "sources/github/owner/repo")'),
  prompt: z.string().optional().describe('Task prompt for Jules (for start_session)'),
  sessionId: z.string().optional().describe('Session ID for check_status'),
  automationMode: z.enum(['AUTO_CREATE_PR', 'NONE']).default('AUTO_CREATE_PR').optional().describe('PR mode for new sessions')
});

export const name = 'jules';
export const description = 'Developer Agent Manager. Use to list repositories, start building tasks with Jules, and track PR progress.';
export const permission = 'execute';

export const execute = async (args: Record<string, unknown>): Promise<any> => {
    const { action, source, prompt, sessionId, automationMode } = inputSchema.parse(args);
    if (!API_KEY) throw new Error('JULES_API_KEY not found in environment.');

    switch (action) {
        case 'list_sources': {
            const response = await fetch(`${BASE_URL}/sources`, {
                headers: { 'X-Goog-Api-Key': API_KEY }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
            const data: any = await response.json();
            return data.sources.map((s: any) => ({ name: s.name, id: s.id, repo: s.githubRepo?.repo }));
        }

        case 'start_session': {
            if (!source || !prompt) throw new Error('Source and prompt are required for start_session.');
            const response = await fetch(`${BASE_URL}/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': API_KEY
                },
                body: JSON.stringify({
                    prompt,
                    sourceContext: {
                        source,
                        githubRepoContext: { startingBranch: 'main' }
                    },
                    automationMode
                })
            });
            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
            const data: any = await response.json();
            return {
                message: 'Jules session started.',
                sessionId: data.id,
                sessionName: data.name
            };
        }

        case 'check_status': {
            if (!sessionId) throw new Error('Session ID is required for check_status.');

            // Get Session
            const sessionRes = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
                headers: { 'X-Goog-Api-Key': API_KEY }
            });
            if (!sessionRes.ok) throw new Error(`API Error: ${sessionRes.status}`);
            const sessionData: any = await sessionRes.json();

            // Get Activities
            const activitiesRes = await fetch(`${BASE_URL}/sessions/${sessionId}/activities?pageSize=5`, {
                headers: { 'X-Goog-Api-Key': API_KEY }
            });
            const activitiesData: any = await activitiesRes.json();

            const pr = sessionData.outputs?.find((o: any) => o.pullRequest)?.pullRequest;

            return {
                title: sessionData.title,
                prUrl: pr?.url,
                activities: (activitiesData.activities || []).map((a: any) => ({
                    time: a.createTime,
                    originator: a.originator,
                    summary: a.progressUpdated?.title || (a.planGenerated ? 'Plan Generated' : 'Activity')
                }))
            };
        }

        default:
            throw new Error(`Invalid action: ${action}`);
    }
};

export const tool: Tool = {
    name,
    description,
    permission,
    inputSchema,
    execute
};
