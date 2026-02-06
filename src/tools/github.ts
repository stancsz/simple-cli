import { z } from 'zod';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
  action: z.enum(['create_issue']).describe('Action to perform'),
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  title: z.string().optional().describe('Issue title (required for create_issue)'),
  body: z.string().optional().describe('Issue body'),
});

type GithubInput = z.infer<typeof inputSchema>;

interface GithubResult {
  action: string;
  success: boolean;
  data?: any;
  error?: string;
}

export async function execute(input: Record<string, unknown> | GithubInput): Promise<GithubResult> {
  let parsed: GithubInput;
  try {
    parsed = inputSchema.parse(input);
  } catch (error) {
    return {
      action: (input as any).action || 'unknown',
      success: false,
      error: error instanceof z.ZodError ? error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') : String(error),
    };
  }

  const { action, owner, repo, title, body } = parsed;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (!token) {
    return {
      action,
      success: false,
      error: 'GITHUB_TOKEN or GH_TOKEN not found in environment',
    };
  }

  const baseUrl = 'https://api.github.com';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'simple-cli',
  };

  try {
    if (action === 'create_issue') {
      if (!title) {
        return {
          action,
          success: false,
          error: 'Title is required for creating an issue',
        };
      }

      const response = await fetch(`${baseUrl}/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          action,
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        action,
        success: true,
        data,
      };
    }

    return {
      action,
      success: false,
      error: `Unknown action: ${action}`,
    };
  } catch (error) {
    return {
      action,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const tool: Tool = {
  name: 'github',
  description: 'Interact with GitHub API to create issues',
  inputSchema,
  permission: 'execute',
  execute: async (args) => execute(args),
};
