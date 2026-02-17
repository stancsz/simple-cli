import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartRouterServer } from '../src/mcp_servers/smart_router/index.js';
import { LLM } from '../src/llm.js';

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify({
      agents: {
        "test-agent": { description: "Test Agent" }
      }
    })),
  };
});

// Mock McpServer
const mockTool = vi.fn();
const mockConnect = vi.fn();
const mockMcpServerInstance = {
  tool: mockTool,
  connect: mockConnect,
};

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: vi.fn(() => mockMcpServerInstance),
  };
});

// Mock LLM
const mockGenerate = vi.fn();
const mockLLM = {
  generate: mockGenerate,
} as unknown as LLM;

describe('SmartRouterServer', () => {
  let router: SmartRouterServer;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new SmartRouterServer(mockLLM);
  });

  it('should initialize and register tools', () => {
    expect(mockTool).toHaveBeenCalledWith(
      "route_task",
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockTool).toHaveBeenCalledWith(
      "report_outcome",
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should route task using LLM', async () => {
    // Get the route_task handler
    const routeTaskCall = mockTool.mock.calls.find(call => call[0] === 'route_task');
    const handler = routeTaskCall[3];

    // Mock LLM response
    mockGenerate.mockResolvedValue({
      message: JSON.stringify({
        recommended_agent: 'test-agent',
        confidence_score: 0.9,
        estimated_cost: 0.05,
        reasoning: 'Coding task'
      }),
      raw: '{"recommended_agent": "test-agent"...}'
    });

    const result = await handler({
      task_description: 'Write a python script',
      priority: 'high'
    });

    expect(mockGenerate).toHaveBeenCalled();
    const prompt = mockGenerate.mock.calls[0][1][0].content;
    expect(prompt).toContain('Task:');
    expect(prompt).toContain('Write a python script');

    expect(JSON.parse(result.content[0].text)).toEqual({
      recommended_agent: 'test-agent',
      confidence_score: 0.9,
      estimated_cost: 0.05,
      reasoning: 'Coding task'
    });
  });

  it('should handle invalid LLM response in route_task', async () => {
    const routeTaskCall = mockTool.mock.calls.find(call => call[0] === 'route_task');
    const handler = routeTaskCall[3];

    // Mock invalid LLM response
    mockGenerate.mockResolvedValue({
      message: "Not JSON",
      raw: "Not JSON"
    });

    const result = await handler({
      task_description: 'Unknown task'
    });

    const parsed = JSON.parse(result.content[0].text);
    // Should fallback or return error structure
    // Our implementation defaults to "unknown" or first agent
    // Since we rely on loaded agents or defaults.
    // If no config, we use defaults (coder, researcher, planner).
    // So fallback might be "coder".
    expect(parsed.recommended_agent).toBeDefined();
    expect(parsed.reasoning).toContain('LLM failed');
    // Actually the reasoning is "Failed to parse router decision." or "LLM failed to return valid JSON..."
  });

  it('should update metrics via report_outcome', async () => {
    // Get handlers
    const reportOutcomeCall = mockTool.mock.calls.find(call => call[0] === 'report_outcome');
    const reportHandler = reportOutcomeCall[3];

    // Default agents include "test-agent"
    await reportHandler({
      agent_id: 'test-agent',
      success: true,
      duration_ms: 1000,
      cost: 0.01
    });

    // Check internal state via checking if route_task prompt includes metrics
    // We need to call route_task again
    const routeTaskCall = mockTool.mock.calls.find(call => call[0] === 'route_task');
    const routeHandler = routeTaskCall[3];

    mockGenerate.mockResolvedValue({
      message: JSON.stringify({ recommended_agent: 'test-agent' })
    });

    await routeHandler({ task_description: 'Another task' });

    const prompt = mockGenerate.mock.calls[0][1][0].content; // 1st call in this test
    // Metrics for 'test-agent': 1 request, 100% success, 1000ms avg
    expect(prompt).toContain('test-agent');
    expect(prompt).toContain('Success: 100.0%');
    expect(prompt).toContain('Avg Time: 1000ms');
  });
});
