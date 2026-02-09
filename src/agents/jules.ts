
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

export interface JulesTaskResult {
    success: boolean;
    prUrl?: string;
    message: string;
}

interface Source {
    name: string;
    id: string;
    githubRepo: {
        owner: string;
        repo: string;
    };
}

export class JulesClient {
    private apiBaseUrl: string;
    private apiKey?: string;

    constructor(config: { apiKey?: string; apiBaseUrl?: string } = {}) {
        this.apiKey = config.apiKey || process.env.JULES_API_KEY;
        this.apiBaseUrl = config.apiBaseUrl || 'https://jules.googleapis.com/v1alpha';
    }

    private async getRepoInfo(): Promise<{ owner: string, repo: string, branch: string }> {
        // Try to detect from git
        try {
            const { stdout: remoteUrl } = await execAsync('git remote get-url origin');
            // Support https://github.com/owner/repo.git or git@github.com:owner/repo.git
            let owner = '', repo = '';
            const cleanUrl = remoteUrl.trim().replace(/\.git$/, '');

            if (cleanUrl.startsWith('http')) {
                const parts = cleanUrl.split('/');
                owner = parts[parts.length - 2];
                repo = parts[parts.length - 1];
            } else if (cleanUrl.includes(':')) {
                const parts = cleanUrl.split(':');
                const path = parts[1].split('/');
                owner = path[0];
                repo = path[1];
            }

            const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
            return { owner, repo, branch: branch.trim() };
        } catch (e) {
            console.warn("[JulesClient] Could not detect git repo info locally. Falling back to defaults if possible.");
            return { owner: 'stancsz', repo: 'simple-cli', branch: 'main' }; // Fallback
        }
    }

    private async listSources(): Promise<Source[]> {
        const url = `${this.apiBaseUrl}/sources`;
        const response = await fetch(url, {
            headers: {
                'X-Goog-Api-Key': this.apiKey || ''
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to list sources: ${response.status} ${response.statusText} - ${await response.text()}`);
        }
        const data: any = await response.json();
        return data.sources || [];
    }

    private async createSession(sourceName: string, prompt: string, branch: string) {
        const url = `${this.apiBaseUrl}/sessions`;
        const body = {
            prompt,
            sourceContext: {
                source: sourceName,
                githubRepoContext: {
                    startingBranch: branch
                }
            },
            automationMode: "AUTO_CREATE_PR",
            title: `Task: ${prompt.substring(0, 30)}...`
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': this.apiKey || ''
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Failed to create session: ${response.status} ${response.statusText} - ${await response.text()}`);
        }
        return await response.json();
    }

    private async getSession(sessionId: string) {
        const url = `${this.apiBaseUrl}/sessions/${sessionId}`; // Note: sessionId might include "sessions/" prefix

        const fullUrl = sessionId.startsWith('sessions/')
            ? `${this.apiBaseUrl}/${sessionId}`
            : `${this.apiBaseUrl}/sessions/${sessionId}`;

        const response = await fetch(fullUrl, {
            headers: {
                'X-Goog-Api-Key': this.apiKey || ''
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to get session: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Executes a task using the Jules API.
     */
    async executeTask(task: string, contextFiles: string[] = []): Promise<JulesTaskResult> {
        try {
            if (!this.apiKey) {
                return { success: false, message: "JULES_API_KEY not set. Cannot call Jules API." };
            }

            console.log(`[JulesClient] Detecting repository...`);
            const { owner, repo, branch } = await this.getRepoInfo();
            console.log(`[JulesClient] Target: ${owner}/${repo} on branch ${branch}`);

            console.log(`[JulesClient] Finding source in Jules...`);
            const sources = await this.listSources();
            const source = sources.find(s => s.githubRepo.owner === owner && s.githubRepo.repo === repo);

            if (!source) {
                return {
                    success: false,
                    message: `Repository ${owner}/${repo} not found in your Jules sources. Please connect it first.`
                };
            }
            console.log(`[JulesClient] Found source: ${source.name}`);

            // Augment prompt with context files if any
            let prompt = task;
            if (contextFiles.length > 0) {
                prompt += `\n\nContext Files: ${contextFiles.join(', ')} (Please read these if needed)`;
            }

            console.log(`[JulesClient] Creating session for task: "${task}"...`);
            const session = await this.createSession(source.name, prompt, branch);
            console.log(`[JulesClient] Session created: ${session.name}`);

            // Poll for PR
            console.log(`[JulesClient] Polling for Pull Request (timeout 5m)...`);
            const startTime = Date.now();
            while (Date.now() - startTime < 300000) { // 5 min timeout
                const updatedSession: any = await this.getSession(session.name);

                if (updatedSession.outputs && updatedSession.outputs.length > 0) {
                    for (const output of updatedSession.outputs) {
                        if (output.pullRequest) {
                            return {
                                success: true,
                                prUrl: output.pullRequest.url,
                                message: `Jules created PR: ${output.pullRequest.url}`
                            };
                        }
                    }
                }

                // Wait 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
                process.stdout.write('.');
            }

            return {
                success: false,
                message: "Timeout waiting for Jules to create a PR. Session is still active: " + session.name
            };

        } catch (error: any) {
            console.error(`[JulesClient] Error executing task:`, error);
            return {
                success: false,
                message: `Jules API Task failed: ${error.message}`
            };
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const files: string[] = [];
    let task = '';

    // Simple arg parsing
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--file' || arg === '-f') {
            if (i + 1 < args.length) {
                files.push(args[++i]);
            }
        } else if (!arg.startsWith('-')) {
            // Assume the first non-flag arg is the task (or append to task)
            if (task) task += ' ' + arg;
            else task = arg;
        }
    }

    if (!task) {
        console.error('Error: No task description provided.');
        process.exit(1);
    }

    console.log(`[Jules Agent] Starting task: "${task}"`);
    console.log(`[Jules Agent] Context files: ${files.length}`);

    const client = new JulesClient({
        apiKey: process.env.JULES_API_KEY,
    });

    // Execute the task
    const result = await client.executeTask(task, files);

    if (result.success) {
        console.log(`\n[SUCCESS] Task completed.`);
        if (result.prUrl) {
            console.log(`PR Created: ${result.prUrl}`);
            // JSON output for structured tools
            console.log(JSON.stringify({ status: 'success', pr_url: result.prUrl, message: result.message }));
        } else {
            console.log(result.message);
        }
    } else {
        console.error(`\n[FAILURE] Task failed.`);
        console.error(result.message);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
