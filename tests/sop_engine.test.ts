import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSOP } from '../src/mcp_servers/sop_engine/sop_parser.js';
import { SOPExecutor } from '../src/mcp_servers/sop_engine/executor.js';

// Mock dependencies for injection
const mockGenerate = vi.fn();
const mockGetTools = vi.fn();
const mockToolExecute = vi.fn();
const mockInit = vi.fn();

const mockLLM = {
  generate: mockGenerate,
  embed: vi.fn(),
  personaEngine: {} as any
} as any;

const mockMCP = {
  init: mockInit,
  getTools: mockGetTools,
  startServer: vi.fn(),
  isServerRunning: vi.fn(),
  getClient: vi.fn(),
  stopServer: vi.fn(),
  listServers: vi.fn()
} as any;

describe('SOP Engine Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleSOPContent = `
# Deploy to AWS

This SOP deploys the app.

1. **Check Branch**
   Check if we are on main branch.

2. **Build**
   Run the build script.
`;

  it('should parse SOP correctly', () => {
    const sop = parseSOP(sampleSOPContent);
    expect(sop.title).toBe('Deploy to AWS');
    expect(sop.steps).toHaveLength(2);
  });

  it('should execute SOP successfully', async () => {
    const sop = parseSOP(sampleSOPContent);

    const tools = [
      {
        name: 'git_status',
        description: 'Check git status',
        execute: mockToolExecute
      },
      {
        name: 'run_shell',
        description: 'Run shell command',
        execute: mockToolExecute
      }
    ];
    mockGetTools.mockResolvedValue(tools);

    mockGenerate
      .mockResolvedValueOnce({
        tool: 'git_status',
        args: {},
        thought: 'Checking branch',
        message: 'Checking branch',
        raw: ''
      })
      .mockResolvedValueOnce({
        tool: 'complete_step',
        args: { summary: 'On main branch' },
        thought: 'Branch is correct',
        message: 'Branch is correct',
        raw: ''
      })
      .mockResolvedValueOnce({
        tool: 'run_shell',
        args: { command: 'npm run build' },
        thought: 'Building',
        message: 'Building',
        raw: ''
      })
      .mockResolvedValueOnce({
        tool: 'complete_step',
        args: { summary: 'Build success' },
        thought: 'Build done',
        message: 'Build done',
        raw: ''
      });

    mockToolExecute.mockResolvedValue('Success');

    const executor = new SOPExecutor(mockLLM, mockMCP);
    const result = await executor.execute(sop, 'Deploy now');

    expect(result).toContain("SOP 'Deploy to AWS' executed successfully");
    expect(mockGenerate).toHaveBeenCalledTimes(4);
    expect(mockToolExecute).toHaveBeenCalledTimes(2);
  });

  it('should handle retry on tool failure', async () => {
     const sop = parseSOP(`# Test Retry\n1. **Step 1**\nDo something.`);

     mockGetTools.mockResolvedValue([{ name: 'tool_a', execute: mockToolExecute }]);

     mockToolExecute.mockRejectedValueOnce(new Error('Tool failed')).mockResolvedValueOnce('Success');

     mockGenerate
      .mockResolvedValueOnce({ tool: 'tool_a', args: {}, raw: '' })
      .mockResolvedValueOnce({ tool: 'tool_a', args: {}, raw: '' })
      .mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' }, raw: '' });

     const executor = new SOPExecutor(mockLLM, mockMCP);
     await executor.execute(sop, '');

     expect(mockGenerate).toHaveBeenCalledTimes(3);
     expect(mockToolExecute).toHaveBeenCalledTimes(2);
  });

  it('should handle fatal error via fail_step', async () => {
    const sop = parseSOP(`# Test Fatal\n1. **Step 1**\nImpossible task.`);
    mockGetTools.mockResolvedValue([]);

    mockGenerate.mockResolvedValueOnce({
        tool: 'fail_step',
        args: { reason: 'Cannot proceed' },
        raw: ''
    });

    const executor = new SOPExecutor(mockLLM, mockMCP);

    await expect(executor.execute(sop, '')).rejects.toThrow('Cannot proceed');
  });

  it('should fail if max retries exceeded', async () => {
    const sop = parseSOP(`# Test Fail\n1. **Step 1**\nDo something.`);
    mockGetTools.mockResolvedValue([]);

    mockGenerate.mockResolvedValue({ tool: 'none', args: {}, raw: '' });

    const executor = new SOPExecutor(mockLLM, mockMCP);

    await expect(executor.execute(sop, '')).rejects.toThrow(/Failed to complete Step 1 after 5 retries/);
  });
});
