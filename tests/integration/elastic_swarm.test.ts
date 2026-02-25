import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScalingEngine } from '../../src/mcp_servers/elastic_swarm/scaling_engine.js';
import { join } from 'path';

// Mock MCP Client and FS
const { mockCallTool, mockConnect, mockReadFile, mockExistsSync } = vi.hoisted(() => {
    return {
        mockCallTool: vi.fn(),
        mockConnect: vi.fn(),
        mockReadFile: vi.fn(),
        mockExistsSync: vi.fn()
    };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      callTool: mockCallTool
    }))
  };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
    return {
        SSEClientTransport: vi.fn().mockImplementation(() => ({}))
    };
});

vi.mock('fs/promises', () => ({
  readFile: mockReadFile
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync
}));

describe('Elastic Swarm Scaling Engine', () => {
  let engine: ScalingEngine;
  const agentDir = '/tmp/agent';

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ScalingEngine(agentDir);
    mockExistsSync.mockReturnValue(true);
  });

  it('should scale up when pending tasks > 5', async () => {
    // Mock Scheduler State (6 pending tasks)
    mockReadFile.mockResolvedValue(JSON.stringify({
      pendingTasks: new Array(6).fill({ id: 'task' })
    }));

    // Mock Swarm Metrics
    mockCallTool.mockImplementation((req) => {
        if (req.name === 'get_agent_metrics') {
            return Promise.resolve({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        total_agents: 1,
                        active_agents: 1,
                        agents: [{ id: 'agent-1', idleSeconds: 0 }]
                    })
                }]
            });
        }
        return Promise.resolve({});
    });

    await engine.tick();

    // Verify spawn_subagent called
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'spawn_subagent',
      arguments: expect.objectContaining({
        role: 'Worker',
        parent_agent_id: 'elastic-swarm'
      })
    }));
  });

  it('should scale down when agent idle > 300s', async () => {
    // Mock Scheduler State (0 pending tasks)
    mockReadFile.mockResolvedValue(JSON.stringify({
      pendingTasks: []
    }));

    // Mock Swarm Metrics (1 idle agent)
    mockCallTool.mockImplementation((req) => {
        if (req.name === 'get_agent_metrics') {
            return Promise.resolve({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        total_agents: 1,
                        active_agents: 1,
                        agents: [{ id: 'agent-idle', idleSeconds: 301 }]
                    })
                }]
            });
        }
        return Promise.resolve({});
    });

    await engine.tick();

    // Verify terminate_agent called
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'terminate_agent',
      arguments: {
        agent_id: 'agent-idle'
      }
    }));
  });

  it('should do nothing when state is balanced', async () => {
    // Mock Scheduler State (3 pending tasks)
    mockReadFile.mockResolvedValue(JSON.stringify({
      pendingTasks: new Array(3).fill({ id: 'task' })
    }));

    // Mock Swarm Metrics (1 active agent, not idle)
    mockCallTool.mockImplementation((req) => {
        if (req.name === 'get_agent_metrics') {
            return Promise.resolve({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        total_agents: 1,
                        active_agents: 1,
                        agents: [{ id: 'agent-1', idleSeconds: 10 }]
                    })
                }]
            });
        }
        return Promise.resolve({});
    });

    await engine.tick();

    // Verify NO scaling actions
    const calls = mockCallTool.mock.calls.map(c => c[0].name);
    expect(calls).not.toContain('spawn_subagent');
    expect(calls).not.toContain('terminate_agent');
  });
});
