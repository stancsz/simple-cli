import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SOPExecutor } from '../../src/mcp_servers/sop_engine/executor.js';
import { LLM } from '../../src/llm.js';
import { MCP } from '../../src/mcp.js';
import { SOP } from '../../src/mcp_servers/sop_engine/sop_parser.js';

// Mock dependencies
// Note: Actual LLM and MCP classes are not used, we mock instances.
// However, the import is needed for type safety if using real types.
// We can use partial mocks.

describe('SOPExecutor', () => {
  let mockLLM: any;
  let mockMCP: any;
  let mockTool: any;

  beforeEach(() => {
    mockTool = {
      name: 'mock_tool',
      description: 'Mock tool',
      inputSchema: {},
      execute: vi.fn().mockResolvedValue('Mock Result')
    };

    mockLLM = {
      generate: vi.fn()
    };

    mockMCP = {
      init: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn().mockResolvedValue([mockTool])
    };
  });

  it('should execute a single step SOP successfully', async () => {
    // LLM behavior:
    // 1. Call mock_tool
    // 2. Call complete_step
    mockLLM.generate
        .mockResolvedValueOnce({
          thought: 'I need to use mock_tool',
          tool: 'mock_tool',
          args: { key: 'value' },
          message: 'Executing tool'
        })
        .mockResolvedValueOnce({
          thought: 'Step is done',
          tool: 'complete_step',
          args: { summary: 'Task completed' },
          message: 'Done'
        });

    const executor = new SOPExecutor(mockLLM, mockMCP);

    const sop: SOP = {
      title: 'Test SOP',
      description: 'Description',
      steps: [
        { number: 1, name: 'Step 1', description: 'Do something.' }
      ]
    };

    const result = await executor.execute(sop, 'Initial Input');

    expect(mockMCP.init).toHaveBeenCalled();
    // It calls getTools inside the loop (at least twice)
    expect(mockMCP.getTools).toHaveBeenCalled();

    // Check tool execution
    expect(mockTool.execute).toHaveBeenCalledWith({ key: 'value' });

    // Check result
    expect(result).toContain('SOP \'Test SOP\' executed successfully');
    expect(result).toContain('Step 1 completed: Task completed');
  });

  it('should handle tool errors gracefully', async () => {
    // LLM behavior:
    // 1. Call mock_tool -> Fails
    // 2. Call complete_step (after "fixing" or retrying)

    mockTool.execute.mockRejectedValueOnce(new Error('Tool failed'));

    mockLLM.generate
        .mockResolvedValueOnce({
          thought: 'Try tool',
          tool: 'mock_tool',
          args: {},
          message: 'Executing'
        })
        .mockResolvedValueOnce({
          thought: 'Tool failed, but I will complete anyway for test',
          tool: 'complete_step',
          args: { summary: 'Recovered' },
          message: 'Done'
        });

    const executor = new SOPExecutor(mockLLM, mockMCP);

    const sop: SOP = {
        title: 'Error Test',
        description: '',
        steps: [{ number: 1, name: 'Step 1', description: '' }]
    };

    await executor.execute(sop, '');

    expect(mockTool.execute).toHaveBeenCalled();
    // LLM should have been called twice (once for tool call, once for completion)
    expect(mockLLM.generate).toHaveBeenCalledTimes(2);
  });

  it('should fail explicitly if LLM calls fail_step', async () => {
    mockLLM.generate.mockResolvedValueOnce({
      tool: 'fail_step',
      args: { reason: 'Cannot proceed' },
      message: 'Giving up'
    });

    const executor = new SOPExecutor(mockLLM, mockMCP);
    const sop: SOP = {
        title: 'Fail Test',
        description: '',
        steps: [{ number: 1, name: 'Step 1', description: '' }]
    };

    await expect(executor.execute(sop, '')).rejects.toThrow('Cannot proceed');
  });
});
