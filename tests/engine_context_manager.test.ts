import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../src/engine/context-manager.js';
import { MCP } from '../src/mcp.js';

describe('ContextManager (Engine)', () => {
  it('should return context from brain when available', async () => {
    const mockMcp = {
      getClient: vi.fn().mockReturnValue({
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Task #1: Context' }]
        })
      })
    } as unknown as MCP;

    const cm = new ContextManager();
    const context = await cm.getCurrentContext('query', mockMcp);

    expect(context).toBe('Task #1: Context');
    expect(mockMcp.getClient).toHaveBeenCalledWith('brain');
  });

  it('should return empty string if brain client is missing', async () => {
    const mockMcp = {
      getClient: vi.fn().mockReturnValue(undefined)
    } as unknown as MCP;

    const cm = new ContextManager();
    const context = await cm.getCurrentContext('query', mockMcp);

    expect(context).toBe('');
  });

  it('should return empty string on error', async () => {
    const mockMcp = {
      getClient: vi.fn().mockReturnValue({
        callTool: vi.fn().mockRejectedValue(new Error('Failed'))
      })
    } as unknown as MCP;

    const cm = new ContextManager();
    const context = await cm.getCurrentContext('query', mockMcp);

    expect(context).toBe('');
  });

  // Timeout test is hard to do reliably without fake timers, skipping for now or use vi.useFakeTimers
});
