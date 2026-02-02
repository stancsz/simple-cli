/**
 * Tests for Agent with reflection and retry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  parseResponse,
  buildReflectionPrompt,
  buildLintErrorPrompt,
  buildTestFailurePrompt,
  summarizeHistory,
} from '../../src/lib/agent.js';
import { Message } from '../../src/context.js';

describe('agent', () => {
  describe('parseResponse', () => {
    it('should extract thought from response', () => {
      const response = `
<thought>
I need to analyze the code first.
Then make changes.
</thought>

{"tool": "read_files", "args": {"paths": ["src/index.ts"]}}
`;

      const result = parseResponse(response);

      expect(result.thought).toContain('analyze the code');
      expect(result.thought).toContain('make changes');
    });

    it('should extract tool action', () => {
      const response = `
<thought>Let me read the file</thought>

{"tool": "read_files", "args": {"paths": ["test.txt"]}}
`;

      const result = parseResponse(response);

      expect(result.action).toEqual({
        tool: 'read_files',
        args: { paths: ['test.txt'] },
      });
    });

    it('should handle no action (none tool)', () => {
      const response = `
<thought>This is just a question</thought>

{"tool": "none", "message": "I understand your question."}
`;

      const result = parseResponse(response);

      expect(result.action.tool).toBe('none');
      expect((result.action as any).message).toBe('I understand your question.');
    });

    it('should handle malformed JSON gracefully', () => {
      const response = `
<thought>Let me help</thought>

{"tool": "read_files" broken json
`;

      const result = parseResponse(response);

      expect(result.action.tool).toBe('none');
    });

    it('should extract edit blocks', () => {
      const response = `
<thought>I'll update the file</thought>

src/index.ts
\`\`\`typescript
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE
\`\`\`
`;

      const result = parseResponse(response);

      expect(result.editBlocks).toBeDefined();
      expect(result.editBlocks?.length).toBe(1);
      expect(result.editBlocks?.[0].file).toContain('index.ts');
    });

    it('should handle response with only thought', () => {
      const response = `
<thought>
This is a complex problem.
I need to think about it.
</thought>
`;

      const result = parseResponse(response);

      expect(result.thought).toBeDefined();
      expect(result.action.tool).toBe('none');
    });
  });

  describe('buildReflectionPrompt', () => {
    it('should include attempt number', () => {
      const prompt = buildReflectionPrompt({
        attempt: 2,
        previousError: 'Match failed',
        previousResponse: 'Previous LLM response',
        failedEdits: [],
      });

      expect(prompt).toContain('Attempt 2');
    });

    it('should include previous error', () => {
      const prompt = buildReflectionPrompt({
        attempt: 1,
        previousError: 'SEARCH block did not match',
        previousResponse: '',
        failedEdits: [],
      });

      expect(prompt).toContain('SEARCH block did not match');
    });

    it('should include failed edit details', () => {
      const prompt = buildReflectionPrompt({
        attempt: 1,
        previousError: 'Edit failed',
        previousResponse: '',
        failedEdits: [
          {
            file: 'src/test.ts',
            success: false,
            applied: false,
            error: 'No match found',
            suggestion: 'Did you mean line 15-20?',
          },
        ],
      });

      expect(prompt).toContain('src/test.ts');
      expect(prompt).toContain('No match found');
      expect(prompt).toContain('Did you mean line 15-20');
    });

    it('should include instructions for retry', () => {
      const prompt = buildReflectionPrompt({
        attempt: 1,
        previousError: 'Error',
        previousResponse: '',
        failedEdits: [],
      });

      expect(prompt).toContain('SEARCH block must EXACTLY match');
      expect(prompt).toContain('Try again');
    });
  });

  describe('buildLintErrorPrompt', () => {
    it('should include file name', () => {
      const prompt = buildLintErrorPrompt('src/index.ts', 'Line 10: Unexpected token');

      expect(prompt).toContain('src/index.ts');
    });

    it('should include lint errors', () => {
      const errors = `
Line 5: Missing semicolon
Line 10: Unused variable 'x'
`;
      const prompt = buildLintErrorPrompt('test.ts', errors);

      expect(prompt).toContain('Missing semicolon');
      expect(prompt).toContain("Unused variable 'x'");
    });

    it('should ask for fix', () => {
      const prompt = buildLintErrorPrompt('file.ts', 'error');

      expect(prompt).toContain('fix');
      expect(prompt).toContain('SEARCH/REPLACE');
    });
  });

  describe('buildTestFailurePrompt', () => {
    it('should include test output', () => {
      const output = 'FAIL src/test.spec.ts\n  ✕ should work (5ms)';

      const prompt = buildTestFailurePrompt(output);

      expect(prompt).toContain('FAIL');
      expect(prompt).toContain('should work');
    });

    it('should truncate long output', () => {
      const longOutput = 'x'.repeat(3000);

      const prompt = buildTestFailurePrompt(longOutput);

      expect(prompt.length).toBeLessThan(3000);
      expect(prompt).toContain('truncated');
    });

    it('should ask to fix the code', () => {
      const prompt = buildTestFailurePrompt('test failed');

      expect(prompt).toContain('fix');
      expect(prompt).toContain('SEARCH/REPLACE');
    });
  });

  describe('summarizeHistory', () => {
    it('should return history unchanged if under limit', async () => {
      const history: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const mockGenerate = vi.fn();
      const result = await summarizeHistory(history, mockGenerate, 10);

      expect(result).toEqual(history);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('should summarize when over limit', async () => {
      const history: Message[] = [];
      for (let i = 0; i < 25; i++) {
        history.push({ role: 'user', content: `Message ${i}` });
        history.push({ role: 'assistant', content: `Response ${i}` });
      }

      const mockGenerate = vi.fn().mockResolvedValue('Summary of conversation about messages 0-40');

      const result = await summarizeHistory(history, mockGenerate, 10);

      expect(mockGenerate).toHaveBeenCalled();
      expect(result.length).toBeLessThan(history.length);
      // Should keep first and last messages
      expect(result[0]).toEqual(history[0]);
      // Should have summary
      expect(result.some(m => m.content.includes('Summary'))).toBe(true);
    });

    it('should preserve first message', async () => {
      const history: Message[] = [
        { role: 'system', content: 'Important context' },
        ...Array(20).fill(null).map((_, i) => ({
          role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: `Message ${i}`,
        })),
      ];

      const mockGenerate = vi.fn().mockResolvedValue('Summary');

      const result = await summarizeHistory(history, mockGenerate, 10);

      expect(result[0].content).toBe('Important context');
    });

    it('should preserve recent messages', async () => {
      const history: Message[] = Array(30).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `Message ${i}`,
      }));

      const mockGenerate = vi.fn().mockResolvedValue('Summary');

      const result = await summarizeHistory(history, mockGenerate, 10);

      // Last few messages should be preserved
      const lastOriginal = history[history.length - 1].content;
      expect(result.some(m => m.content === lastOriginal)).toBe(true);
    });
  });
});

describe('agent reflection flow', () => {
  it('should build proper reflection context on edit failure', () => {
    const failedEdit = {
      file: 'src/utils.ts',
      success: false,
      applied: false,
      error: 'SEARCH block did not match',
      suggestion: `Did you mean to match:

\`\`\`
function helper() {
  return true;
}
\`\`\``,
    };

    const prompt = buildReflectionPrompt({
      attempt: 1,
      previousError: failedEdit.error,
      previousResponse: 'Previous response with wrong SEARCH block',
      failedEdits: [failedEdit],
    });

    // Should guide the LLM to fix the issue
    expect(prompt).toContain('src/utils.ts');
    expect(prompt).toContain('SEARCH block did not match');
    expect(prompt).toContain('function helper');
    expect(prompt).toContain('EXACTLY match');
  });

  it('should handle multiple failed edits', () => {
    const failedEdits = [
      {
        file: 'file1.ts',
        success: false,
        applied: false,
        error: 'No match',
      },
      {
        file: 'file2.ts',
        success: false,
        applied: false,
        error: 'Syntax error in replacement',
      },
    ];

    const prompt = buildReflectionPrompt({
      attempt: 2,
      previousError: 'Multiple failures',
      previousResponse: '',
      failedEdits,
    });

    expect(prompt).toContain('file1.ts');
    expect(prompt).toContain('file2.ts');
    expect(prompt).toContain('No match');
    expect(prompt).toContain('Syntax error');
  });
});
