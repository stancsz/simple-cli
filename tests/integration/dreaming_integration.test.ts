import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DreamingServer } from '../../src/mcp_servers/dreaming/index.js';

// Use hoisted variables to share mocks between factory and tests
const { mockMCPInstance } = vi.hoisted(() => {
  return {
    mockMCPInstance: {
      init: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn(),
    }
  };
});

// Mock MCP class
vi.mock('../../src/mcp.js', () => {
  return {
    MCP: vi.fn().mockImplementation(() => mockMCPInstance)
  };
});

// Mock fs/promises
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('[]'),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Dreaming Server Integration', () => {
  let server: DreamingServer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset implementations to defaults if needed
    mockMCPInstance.init.mockResolvedValue(undefined);
    mockMCPInstance.getClient.mockReset();

    server = new DreamingServer();
  });

  it('should process failures and log success', async () => {
    const mockBrainClient = {
      callTool: vi.fn().mockImplementation(async ({ name, arguments: args }: any) => {
        if (name === 'brain_query') {
          return {
            content: [{
              type: 'text',
              text: `[Task: task-123]\nTimestamp: 2023-01-01\nRequest: Fix bug\nSolution: Outcome: Failed\nArtifacts: file.ts\n\n---\n\n`
            }]
          };
        }
        if (name === 'brain_store') {
          return { content: [{ type: 'text', text: 'Stored' }] };
        }
        return { content: [] };
      })
    };

    const mockSwarmClient = {
      callTool: vi.fn().mockImplementation(async ({ name, arguments: args }: any) => {
        if (name === 'run_simulation') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                result: 'Outcome: Success. Fixed the bug.',
                artifacts: ['file.ts']
              })
            }]
          };
        }
        return { content: [] };
      })
    };

    // Setup MCP mock to return our specific clients
    mockMCPInstance.getClient.mockImplementation((name: string) => {
      if (name === 'brain') return mockBrainClient;
      if (name === 'swarm') return mockSwarmClient;
      return undefined;
    });

    // Access private method for testing logic
    const result: any = await (server as any).startDreamingSession(5);

    expect(result.content[0].text).toContain('Dreaming Session Complete');
    expect(result.content[0].text).toContain('Success: 1');
    expect(result.content[0].text).toContain('Task task-123: SUCCESS');

    // Verify Brain Query
    expect(mockBrainClient.callTool).toHaveBeenCalledWith({
      name: 'brain_query',
      arguments: { query: 'failure error failed', limit: 5, company: undefined }
    });

    // Verify Swarm Simulation
    expect(mockSwarmClient.callTool).toHaveBeenCalledWith({
      name: 'run_simulation',
      arguments: expect.objectContaining({
        task: expect.stringContaining('Retry past failure'),
        context: expect.stringContaining('Previous Attempt Failed'),
      })
    });

    // Verify Brain Store
    expect(mockBrainClient.callTool).toHaveBeenCalledWith({
      name: 'brain_store',
      arguments: expect.objectContaining({
        taskId: 'dream-fix-task-123',
        request: 'Dreaming Simulation: Fix for task-123',
        solution: expect.stringContaining('Outcome: Success')
      })
    });
  });

  it('should handle no failures found', async () => {
     const mockBrainClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'No relevant memories found.' }]
      })
    };
    mockMCPInstance.getClient.mockImplementation((name: string) => {
        if (name === 'brain') return mockBrainClient;
        return undefined;
    });

    const result: any = await (server as any).startDreamingSession(5);
    expect(result.content[0].text).toContain('No past failures found');
  });

  it('should handle simulation failure', async () => {
    const mockBrainClient = {
      callTool: vi.fn().mockImplementation(async ({ name }: any) => {
        if (name === 'brain_query') {
            return {
            content: [{
              type: 'text',
              text: `[Task: task-fail]\nTimestamp: 2023-01-01\nRequest: Fix bug\nSolution: Outcome: Failed\nArtifacts: file.ts`
            }]
          };
        }
        return { content: [] };
      })
    };

    const mockSwarmClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'failure',
            result: 'Outcome: Failure. Could not fix.',
            artifacts: []
          })
        }]
      })
    };

    mockMCPInstance.getClient.mockImplementation((name: string) => {
      if (name === 'brain') return mockBrainClient;
      if (name === 'swarm') return mockSwarmClient;
      return undefined;
    });

    const result: any = await (server as any).startDreamingSession(5);
    expect(result.content[0].text).toContain('Task task-fail: FAILED');

    // Should NOT call brain_store
    expect(mockBrainClient.callTool).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'brain_store' })
    );
  });
});
