import { describe, it, expect, vi } from 'vitest';
import { runGhostLoop } from '../src/lib/ghost.js';

vi.mock('../src/providers/index.js', () => ({
  createProvider: vi.fn().mockReturnValue({
    generateResponse: vi.fn().mockResolvedValueOnce({
      thought: 'Test thought',
      tool: 'test_tool',
      args: { foo: 'bar' },
      message: ''
    }).mockResolvedValueOnce({
      thought: '',
      tool: 'none',
      args: {},
      message: 'Final answer'
    })
  })
}));

vi.mock('../src/context.js', () => ({
  getContextManager: vi.fn().mockReturnValue({
    addMessage: vi.fn(),
    buildSystemPrompt: vi.fn().mockResolvedValue('System prompt'),
    getHistory: vi.fn().mockReturnValue([]),
    getTools: vi.fn().mockReturnValue(new Map([
      ['test_tool', {
        execute: vi.fn().mockResolvedValue('Tool result')
      }]
    ]))
  })
}));

describe('runGhostLoop', () => {
  it('should run a ghost loop', async () => {
    const output = await runGhostLoop('test prompt');
    expect(output).toContain('[Thought] Test thought');
    expect(output).toContain('[Tool: test_tool] Result: Tool result');
    expect(output).toContain('[Response] Final answer');
  });
});
