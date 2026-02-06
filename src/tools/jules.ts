import { Tool } from '../registry.js';
import { z } from 'zod';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export const inputSchema = z.object({
  action: z.enum(['list_sources', 'start_session', 'check_status', 'sync_pr']).describe('Action to perform'),
  source: z.string().optional().describe('Source name for start_session (e.g. "sources/github/owner/repo")'),
  prompt: z.string().optional().describe('Task prompt for Jules (for start_session)'),
  sessionId: z.string().optional().describe('Session ID for check_status or sync_pr'),
  automationMode: z.enum(['AUTO_CREATE_PR', 'NONE']).default('AUTO_CREATE_PR').optional().describe('PR mode for new sessions')
});

export const name = 'jules';
export const description = 'Developer Agent Manager. Use to list repositories, start building tasks with Jules, and track PR progress.';
export const permission = 'execute';

function getApiKey() {
    const key = process.env.JULES_API_KEY;
    if (!key) throw new Error('JULES_API_KEY not found in environment.');
    return key;
}

async function fetchSession(sessionId: string) {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
        headers: { 'X-Goog-Api-Key': getApiKey() }
    });
    if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
    return await response.json();
}

async function fetchActivities(sessionId: string) {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}/activities?pageSize=5`, {
        headers: { 'X-Goog-Api-Key': getApiKey() }
    });
    if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
    return await response.json();
}

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const execute = async (args: Record<string, unknown>): Promise<any> => {
    const { action, source, prompt, sessionId, automationMode } = inputSchema.parse(args);
    getApiKey(); // Validate API key presence

    switch (action) {
        case 'list_sources': {
            const response = await fetch(`${BASE_URL}/sources`, {
                headers: { 'X-Goog-Api-Key': getApiKey() }
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
                    'X-Goog-Api-Key': getApiKey()
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
            
            const sessionData: any = await fetchSession(sessionId);
            const activitiesData: any = await fetchActivities(sessionId);

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

        case 'sync_pr': {
            if (!sessionId) throw new Error('Session ID is required for sync_pr.');

            // Poll for PR
            for (let i = 0; i < 5; i++) {
                const sessionData: any = await fetchSession(sessionId);
                const pr = sessionData.outputs?.find((o: any) => o.pullRequest)?.pullRequest;
                if (pr?.url) {
                    return { prUrl: pr.url };
                }
                if (i < 4) await delay(2000); // Wait 2s before next retry (total ~10s wait)
            }

            // If no PR found after polling, return activities
            const activitiesData: any = await fetchActivities(sessionId);
            const activities = (activitiesData.activities || []).map((a: any) => ({
                time: a.createTime,
                originator: a.originator,
                summary: a.progressUpdated?.title || (a.planGenerated ? 'Plan Generated' : 'Activity')
            }));

            return {
                summary: 'PR not ready yet. Recent activities:',
                activities
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
