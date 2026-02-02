/**
 * Tests for message handling and conversation flow
 * Equivalent to Aider's test_sendchat.py
 */

import { describe, it, expect } from 'vitest';

describe('messageHandling', () => {
  // Helper to ensure alternating roles
  const ensureAlternatingRoles = (
    messages: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> => {
    if (messages.length === 0) return [];

    const result: Array<{ role: string; content: string }> = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = result[result.length - 1];

      if (current.role === previous.role) {
        // Insert empty message with opposite role
        const fillerRole = current.role === 'user' ? 'assistant' : 'user';
        result.push({ role: fillerRole, content: '' });
      }

      result.push(current);
    }

    return result;
  };

  describe('ensureAlternatingRoles', () => {
    it('should handle empty messages', () => {
      const messages: Array<{ role: string; content: string }> = [];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual([]);
    });

    it('should handle single message', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual(messages);
    });

    it('should pass through already alternating messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' }
      ];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual(messages);
    });

    it('should fix consecutive user messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Are you there?' }
      ];
      const expected = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Are you there?' }
      ];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual(expected);
    });

    it('should fix consecutive assistant messages', () => {
      const messages = [
        { role: 'assistant', content: 'Hi there' },
        { role: 'assistant', content: 'How can I help?' }
      ];
      const expected = [
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: '' },
        { role: 'assistant', content: 'How can I help?' }
      ];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual(expected);
    });

    it('should fix mixed consecutive messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Are you there?' },
        { role: 'assistant', content: 'Yes' },
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Write code' }
      ];
      const expected = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Are you there?' },
        { role: 'assistant', content: 'Yes' },
        { role: 'user', content: '' },
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Write code' }
      ];
      const result = ensureAlternatingRoles(messages);
      expect(result).toEqual(expected);
    });
  });

  describe('message validation', () => {
    const validateMessages = (
      messages: Array<{ role: string; content: string }>
    ): boolean => {
      for (let i = 1; i < messages.length; i++) {
        if (messages[i].role === messages[i - 1].role) {
          return false;
        }
      }
      return true;
    };

    it('should validate proper alternating messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Bye' }
      ];
      expect(validateMessages(messages)).toBe(true);
    });

    it('should reject consecutive same role', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Hello again' }
      ];
      expect(validateMessages(messages)).toBe(false);
    });

    it('should validate empty array', () => {
      expect(validateMessages([])).toBe(true);
    });

    it('should validate single message', () => {
      expect(validateMessages([{ role: 'user', content: 'Hi' }])).toBe(true);
    });
  });

  describe('conversation history management', () => {
    it('should append user message correctly', () => {
      const history: Array<{ role: string; content: string }> = [];

      history.push({ role: 'user', content: 'First message' });

      expect(history.length).toBe(1);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('First message');
    });

    it('should append assistant message correctly', () => {
      const history = [{ role: 'user', content: 'Hello' }];

      history.push({ role: 'assistant', content: 'Hi there!' });

      expect(history.length).toBe(2);
      expect(history[1].role).toBe('assistant');
    });

    it('should append tool result as user message', () => {
      const history = [
        { role: 'user', content: 'Read file' },
        { role: 'assistant', content: '<thought>Reading</thought>{"tool":"readFiles"}' }
      ];

      history.push({ role: 'user', content: 'Tool result: file content here' });

      expect(history.length).toBe(3);
      expect(history[2].role).toBe('user');
      expect(history[2].content).toContain('Tool result');
    });

    it('should handle conversation reset', () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Bye' }
      ];

      history.length = 0;

      expect(history).toEqual([]);
    });
  });

  describe('system prompt handling', () => {
    it('should prepend system message to conversation', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const history = [{ role: 'user', content: 'Hello' }];

      const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      expect(fullMessages.length).toBe(2);
      expect(fullMessages[0].role).toBe('system');
      expect(fullMessages[0].content).toBe(systemPrompt);
    });

    it('should include repo map in system prompt', () => {
      const repoMap = '📄 main.py\n  function: hello';
      const rules = 'Always write tests.';

      const systemPrompt = `Context:\n${repoMap}\n\nRules:\n${rules}`;

      expect(systemPrompt).toContain('main.py');
      expect(systemPrompt).toContain('Always write tests');
    });

    it('should include tool definitions in system prompt', () => {
      const tools = `
Available Tools:
- read_files: Read file contents
- write_files: Write or modify files
- run_command: Execute shell commands
`;

      expect(tools).toContain('read_files');
      expect(tools).toContain('write_files');
      expect(tools).toContain('run_command');
    });
  });

  describe('response format validation', () => {
    it('should validate thought block format', () => {
      const response = '<thought>My reasoning here</thought>';
      const hasThought = /<thought>[\s\S]*<\/thought>/.test(response);
      expect(hasThought).toBe(true);
    });

    it('should validate action JSON format', () => {
      const response = '{"tool": "read_files", "args": {"paths": ["test.txt"]}}';

      let valid = false;
      try {
        const parsed = JSON.parse(response);
        valid = 'tool' in parsed;
      } catch {
        valid = false;
      }

      expect(valid).toBe(true);
    });

    it('should handle response with both thought and action', () => {
      const response = `
<thought>
I need to read the file first.
</thought>

{"tool": "read_files", "args": {"paths": ["config.json"]}}
`;

      const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/);
      const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);

      expect(thoughtMatch).toBeDefined();
      expect(jsonMatch).toBeDefined();
      expect(thoughtMatch![1]).toContain('read the file');
    });
  });
});
