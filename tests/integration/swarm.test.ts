import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmServer } from '../../src/mcp_servers/swarm/index.js';

// Mock LLM to return deterministic responses
const mockGenerate = vi.fn();
vi.mock('../../src/llm.js', () => {
  return {
    createLLM: () => ({
      generate: mockGenerate,
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      personaEngine: {
          loadConfig: vi.fn(),
          injectPersonality: (s: string) => s,
          transformResponse: (r: any) => r
      }
    }),
    LLM: class {
        generate = mockGenerate;
    }
  };
});

// Mock MCP to intercept Brain calls
const mockCallTool = vi.fn().mockResolvedValue({ content: [] });
const mockGetClient = vi.fn().mockReturnValue({
  callTool: mockCallTool,
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
});
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockListServers = vi.fn().mockReturnValue([]);
const mockGetTools = vi.fn().mockResolvedValue([]);
const mockStartServer = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/mcp.js', () => {
  return {
    MCP: class {
      init = mockInit;
      getClient = mockGetClient;
      listServers = mockListServers;
      getTools = mockGetTools;
      startServer = mockStartServer;
    },
  };
});

// Mock ContextManager to avoid file I/O
vi.mock('../../src/context/ContextManager.js', () => ({
  ContextManager: vi.fn().mockImplementation(() => ({
    loadContext: vi.fn().mockResolvedValue({ relevant_past_experiences: [] }),
    saveContext: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Engine, Context, Registry to avoid heavy dependencies?
// But SwarmServer imports them from `../../engine/orchestrator.js`.
// If we mock them, we lose the logic of `engine.run`.
// However, `engine.run` calls `llm.generate`. So if we mock LLM, we can control `engine.run`.
// We don't need to mock Engine if LLM is mocked well.
// But Engine constructor takes LLM, Registry, MCP.
// We mocked LLM and MCP. Registry is simple.

describe('Swarm Integration', () => {
  let server: SwarmServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new SwarmServer();
  });

  it('should spawn sub-agents and log to Brain', async () => {
    // Setup LLM to handle the initial run check
    mockGenerate.mockResolvedValue({
      thought: 'Acknowledging spawn.',
      message: 'Ready for duty.',
      tool: 'none',
      args: {}
    });

    const result = await server.spawnSubAgent('QA Engineer', 'Test the app', 'lead-dev', 'client-a');
    const content = JSON.parse(result.content[0].text);

    expect(content).toHaveProperty('agent_id');
    expect(content.role).toBe('QA Engineer');
    expect(content.status).toBe('spawned');

    // Verify Brain Logging
    expect(mockInit).toHaveBeenCalled();
    expect(mockGetClient).toHaveBeenCalledWith('brain');
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'log_experience',
      arguments: expect.objectContaining({
        task_type: 'spawn_subagent',
        agent_used: 'lead-dev',
        summary: expect.stringContaining('Spawned QA Engineer'),
        company: 'client-a'
      })
    }));

    // Verify Agent was added to workers
    expect(server.workers.has(content.agent_id)).toBe(true);
  });

  it('should negotiate task and select the best bidder', async () => {
    // 1. Spawn 3 agents
    mockGenerate.mockResolvedValue({ message: 'Ready' }); // For spawn init

    const agentA = (await server.spawnSubAgent('Senior Dev', 'init', 'lead')).content[0].text;
    const idA = JSON.parse(agentA).agent_id;

    const agentB = (await server.spawnSubAgent('Junior Dev', 'init', 'lead')).content[0].text;
    const idB = JSON.parse(agentB).agent_id;

    const agentC = (await server.spawnSubAgent('Intern', 'init', 'lead')).content[0].text;
    const idC = JSON.parse(agentC).agent_id;

    // 2. Setup Bids
    // We need mockGenerate to return specific bids based on the agent context or call order.
    // However, `engine.run` passes `ctx.history`. We can inspect the history in the mock implementation?
    // Or simpler: Mock implementation to rotate through responses.

    // Bids:
    // A: Cost 80, Quality 90. Score = 90 - 40 = 50.
    // B: Cost 40, Quality 70. Score = 70 - 20 = 50.
    // C: Cost 20, Quality 60. Score = 60 - 10 = 50.
    // Let's make B clearly win.
    // A: Cost 90, Quality 90. Score = 90 - 45 = 45.
    // B: Cost 30, Quality 80. Score = 80 - 15 = 65. (Winner)
    // C: Cost 10, Quality 40. Score = 40 - 5 = 35.

    mockGenerate.mockReset();
    let callCount = 0;
    mockGenerate.mockImplementation(async (prompt, history) => {
        // Check which agent is calling by inspecting system prompt in history if possible,
        // but history passed to generate is just messages.
        // The Engine keeps context.
        // But here we are just mocking the LLM response.

        // Since negotiation iterates agents in order of input array, we can control the order.
        // But SwarmServer.negotiateTask iterates `agentIds`.

        const responseMap = [
            // Agent A bid
            JSON.stringify({ cost: 90, quality: 90, rationale: "Senior dev, expensive but good." }),
            // Agent B bid
            JSON.stringify({ cost: 30, quality: 80, rationale: "Junior dev, good value." }),
            // Agent C bid
            JSON.stringify({ cost: 10, quality: 40, rationale: "Intern, cheap but risky." })
        ];

        const content = responseMap[callCount % 3];
        callCount++;

        return {
            thought: 'Calculating bid...',
            message: content, // The bid is in the message content
            tool: 'none',
            args: {}
        };
    });

    // 3. Negotiate
    const taskDesc = "Fix a critical bug";
    const result = await server.negotiateTask([idA, idB, idC], taskDesc);
    const content = JSON.parse(result.content[0].text);

    // 4. Verify Winner
    expect(content.winner_id).toBe(idB);
    expect(content.winning_bid.cost).toBe(30);
    expect(content.winning_bid.quality).toBe(80);

    // 5. Verify Brain Logging
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
        name: 'log_experience',
        arguments: expect.objectContaining({
            task_type: 'negotiate_task',
            summary: expect.stringContaining(`Winner: ${idB}`),
        })
    }));
  });
});
