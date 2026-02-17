import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from '../src/context/ContextManager.js';
import { MCP } from '../src/mcp.js';
import { RECALL_CONTEXT_PROMPT } from '../src/llm/prompts.js';

// Mock MCP client
const mockCallTool = vi.fn();
const mockClient = {
  callTool: mockCallTool
};

const mockGetClient = vi.fn();
// Partial mock of MCP
const mockMcp = {
  getClient: mockGetClient
} as unknown as MCP;

describe('ContextManager Integration', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    vi.clearAllMocks();
    contextManager = new ContextManager(mockMcp);
    mockGetClient.mockReturnValue(mockClient);
  });

  it('should load context from Brain', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ text: 'Relevant memory found.' }]
    });

    const result = await contextManager.load('test query', 'test-company');

    expect(mockGetClient).toHaveBeenCalledWith('brain');
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'brain_query',
      arguments: {
        query: 'test query',
        company: 'test-company',
        limit: 3
      }
    });
    expect(result).toBe('Relevant memory found.');
  });

  it('should return empty string if Brain returns no relevant memories', async () => {
    mockCallTool.mockResolvedValue({
        content: [{ text: 'No relevant memories found.' }]
    });

    const result = await contextManager.load('test query');
    expect(result).toBe('');
  });

  it('should return empty string if Brain client is missing', async () => {
      mockGetClient.mockReturnValue(undefined);
      const result = await contextManager.load('test query');
      expect(result).toBe('');
  });

  it('should save context to Brain', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ text: 'Memory stored successfully.' }]
    });

    await contextManager.save('task-123', 'request', 'solution', ['file.ts'], 'test-company');

    expect(mockGetClient).toHaveBeenCalledWith('brain');
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'brain_store',
      arguments: {
        taskId: 'task-123',
        request: 'request',
        solution: 'solution',
        artifacts: '["file.ts"]',
        company: 'test-company'
      }
    });
  });

  it('should handle save error gracefully', async () => {
      mockCallTool.mockRejectedValue(new Error('Brain offline'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await contextManager.save('task-123', 'req', 'sol', [], 'comp');

      expect(consoleSpy).toHaveBeenCalled();
  });
});

describe('Prompt Integration', () => {
    it('should format recall prompt correctly', () => {
        const memory = "Past failed attempt: X";
        const formatted = RECALL_CONTEXT_PROMPT.replace("{{context}}", memory);
        expect(formatted).toContain("## Recalled Context");
        expect(formatted).toContain(memory);
    });
});
