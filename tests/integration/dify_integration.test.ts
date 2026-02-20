import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DifyServer } from '../../src/mcp_servers/dify/index.js';

describe('Dify MCP Server Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetModules();
    originalEnv = { ...process.env };
    process.env.DIFY_API_URL = 'http://mock-dify-api/v1';
    process.env.DIFY_SUPERVISOR_API_KEY = 'mock-supervisor-key';
    process.env.DIFY_CODING_API_KEY = 'mock-coding-key';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should initialize and register tools', () => {
    const difyServer = new DifyServer();
    // Access private property for testing purposes
    const tools = (difyServer as any).server._registeredTools;
    expect(tools).toHaveProperty('run_supervisor_task');
    expect(tools).toHaveProperty('run_coding_task');
    expect(tools).toHaveProperty('dify_chat');
  });

  it('should call run_supervisor_task with correct API endpoint and key', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          outputs: {
            plan: "Mocked Plan"
          },
          status: "succeeded"
        }
      }),
    } as Response);

    const difyServer = new DifyServer();
    const tools = (difyServer as any).server._registeredTools;
    const supervisorTool = tools.run_supervisor_task;

    const result = await supervisorTool.handler({ task: 'plan architecture', context: 'internal doc' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://mock-dify-api/v1/workflows/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-supervisor-key',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('"user":"supervisor-user"')
      })
    );

    // Parse body to verify inputs
    const callArgs = fetchSpy.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.inputs).toEqual({ task: 'plan architecture', context: 'internal doc' });

    expect(result.content[0].text).toContain('Mocked Plan');
  });

  it('should call run_coding_task with correct API endpoint and key', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          outputs: {
            code: "console.log('hello')"
          },
          status: "succeeded"
        }
      }),
    } as Response);

    const difyServer = new DifyServer();
    const tools = (difyServer as any).server._registeredTools;
    const codingTool = tools.run_coding_task;

    const result = await codingTool.handler({ task: 'write code', plan: 'the plan' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://mock-dify-api/v1/workflows/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-coding-key'
        }),
        body: expect.stringContaining('"user":"coding-user"')
      })
    );

    const callArgs = fetchSpy.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.inputs).toEqual({ task: 'write code', plan: 'the plan', code: '' });

    expect(result.content[0].text).toContain("console.log('hello')");
  });

  it('should handle API errors gracefully', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const difyServer = new DifyServer();
    const tools = (difyServer as any).server._registeredTools;
    const supervisorTool = tools.run_supervisor_task;

    const result = await supervisorTool.handler({ task: 'fail' });

    expect(result.content[0].text).toContain('Dify API Error (500): Internal Server Error');
  });

  it('should handle missing API keys', async () => {
    delete process.env.DIFY_SUPERVISOR_API_KEY;

    const difyServer = new DifyServer();
    const tools = (difyServer as any).server._registeredTools;
    const supervisorTool = tools.run_supervisor_task;

    const result = await supervisorTool.handler({ task: 'fail' });

    expect(result.content[0].text).toContain('Error: DIFY_SUPERVISOR_API_KEY environment variable is not set');
  });
});
