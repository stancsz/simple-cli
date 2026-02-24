import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { registerProjectManagementTools } from '../../src/mcp_servers/business_ops/project_management.js';

// Mock McpServer
class MockMcpServer {
  tools: Record<string, any> = {};

  tool(name: string, description: string, argsSchema: any, handler: any) {
    this.tools[name] = {
      description,
      argsSchema: z.object(argsSchema),
      handler
    };
  }

  async call(name: string, args: any) {
    const tool = this.tools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    // Validation
    const parsedArgs = tool.argsSchema.parse(args);
    return tool.handler(parsedArgs);
  }
}

describe('Business Ops - Project Management', () => {
  let server: MockMcpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_API_KEY = 'test_key';
    server = new MockMcpServer();
    registerProjectManagementTools(server as any);

    global.fetch = vi.fn();
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
  });

  it('linear_list_issues should return issues', async () => {
    const mockResponse = {
      data: {
        issues: {
          nodes: [
            { id: '1', title: 'Test Issue 1', state: { name: 'Todo' } },
            { id: '2', title: 'Test Issue 2', state: { name: 'In Progress' } }
          ]
        }
      }
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await server.call('linear_list_issues', { first: 10, teamId: 'team_123' });

    expect(global.fetch).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'test_key',
        'Content-Type': 'application/json'
      }),
      body: expect.stringContaining('"variables":{"first":10,"filter":{"team":{"id":{"eq":"team_123"}}}}')
    }));

    const content = JSON.parse(result.content[0].text);
    expect(content).toHaveLength(2);
    expect(content[0].title).toBe('Test Issue 1');
  });

  it('linear_create_issue should create an issue', async () => {
    const mockResponse = {
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: 'new_issue_id',
            title: 'New Issue',
            url: 'https://linear.app/issue/new_issue_id'
          }
        }
      }
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await server.call('linear_create_issue', { title: 'New Issue', teamId: 'team_123', description: 'Desc' });

    expect(global.fetch).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"variables":{"input":{"title":"New Issue","teamId":"team_123","description":"Desc"}}')
    }));

    const content = JSON.parse(result.content[0].text);
    expect(content.id).toBe('new_issue_id');
  });

  it('linear_update_issue should update an issue', async () => {
    const mockResponse = {
      data: {
        issueUpdate: {
          success: true,
          issue: {
            id: 'issue_123',
            title: 'Updated Title',
            state: { name: 'Done' }
          }
        }
      }
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await server.call('linear_update_issue', { id: 'issue_123', title: 'Updated Title', stateId: 'state_done' });

    expect(global.fetch).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"variables":{"id":"issue_123","input":{"title":"Updated Title","stateId":"state_done"}}')
    }));

    const content = JSON.parse(result.content[0].text);
    expect(content.title).toBe('Updated Title');
  });

  it('should handle API errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized'
    });

    const result = await server.call('linear_list_issues', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Linear API request failed: Unauthorized');
  });

  it('should handle GraphQL errors', async () => {
    const mockResponse = {
      errors: [{ message: 'Validation failed' }]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await server.call('linear_create_issue', { title: 'Fail', teamId: 't1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Linear API errors: Validation failed');
  });
});
