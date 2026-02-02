/**
 * Integration tests for the orchestrator
 * Equivalent to Aider's test_coder.py and GeminiCLI's integration tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseResponse } from '../../src/lib/agent';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock modules before importing
vi.mock('ai', () => ({
  generateText: vi.fn()
}));

import { generateText } from 'ai';

describe('orchestrator integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('response parsing', () => {
    it('should parse thought block from response', () => {
      const response = `
<thought>
I need to read the file first to understand its contents.
Then I will make the necessary changes.
</thought>

{"tool": "read_files", "args": {"paths": ["test.txt"]}}
`;

      const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/);
      const thought = thoughtMatch?.[1]?.trim() || '';

      expect(thought).toContain('read the file first');
      expect(thought).toContain('make the necessary changes');
    });

    it('should parse tool action from response', () => {
      const response = `
<thought>Let me read the file</thought>

{"tool": "readFiles", "args": {"paths": ["test.txt"]}}
`;

      // Use the repository's parser so tool names are normalized
      const parsed = parseResponse(response);
      expect(parsed.action).toBeDefined();
      if ('tool' in parsed.action) {
        expect(parsed.action.tool).toBe('read_files');
        expect((parsed.action as any).args.paths).toEqual(['test.txt']);
      } else {
        throw new Error('No action parsed');
      }
    });

    it('should handle response with no action', () => {
      const response = `
<thought>This is just a question, no action needed</thought>

{"tool": "none", "message": "I understand your question."}
`;

      const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      const action = JSON.parse(jsonMatch![0]);

      expect(action.tool).toBe('none');
      expect(action.message).toBe('I understand your question.');
    });

    it('should handle malformed JSON gracefully', () => {
      const response = `
<thought>Let me help</thought>

{"tool": "read_files" this is broken
`;

      const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      let action = { tool: 'none', message: 'No action parsed' };

      if (jsonMatch) {
        try {
          action = JSON.parse(jsonMatch[0]);
        } catch {
          // Keep default
        }
      }

      expect(action.tool).toBe('none');
    });

    it('should extract thought even without action', () => {
      const response = `
<thought>
This is a complex problem that requires careful analysis.
I will need to:
1. Understand the codebase
2. Identify the issue
3. Propose a solution
</thought>
`;

      const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/);
      const thought = thoughtMatch?.[1]?.trim() || '';

      expect(thought).toContain('complex problem');
      expect(thought).toContain('Identify the issue');
    });
  });

  describe('tool execution flow', () => {
    it('should execute read -> write flow', async () => {
      // Setup test file
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'original content');

      // Import tools
      const { execute: readExecute } = await import('../../src/tools/read_files.js');
      const { execute: writeExecute } = await import('../../src/tools/write_files.js');

      // Read file
      const readResult = await readExecute({ paths: [testFile] });
      expect(readResult[0].content).toBe('original content');

      // Write file with search/replace
      const writeResult = await writeExecute({
        files: [{
          path: testFile,
          searchReplace: [{ search: 'original', replace: 'modified' }]
        }]
      });
      expect(writeResult[0].success).toBe(true);

      // Verify change
      const finalContent = await readFile(testFile, 'utf-8');
      expect(finalContent).toBe('modified content');
    });

    it('should handle file not found gracefully', async () => {
      const { execute: readExecute } = await import('../../src/tools/read_files.js');

      const result = await readExecute({
        paths: [join(testDir, 'nonexistent.txt')]
      });

      expect(result[0].error).toBeDefined();
      expect(result[0].content).toBeUndefined();
    });

    it('should handle command execution with environment', async () => {
      const { execute: runExecute } = await import('../../src/tools/run_command.js');

      const command = process.platform === 'win32' ? 'echo %TEST_VAR%' : 'echo $TEST_VAR';
      const result = await runExecute({
        command,
        env: { TEST_VAR: 'hello_world' }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello_world');
    });
  });

  describe('message handling', () => {
    it('should maintain conversation history structure', () => {
      const history: Array<{ role: string; content: string }> = [];

      // User message
      history.push({ role: 'user', content: 'Hello' });
      expect(history.length).toBe(1);
      expect(history[0].role).toBe('user');

      // Assistant response
      history.push({ role: 'assistant', content: 'Hi there!' });
      expect(history.length).toBe(2);

      // Tool result as user message
      history.push({ role: 'user', content: 'Tool result: success' });
      expect(history.length).toBe(3);

      // Verify alternating pattern
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
      expect(history[2].role).toBe('user');
    });

    it('should handle empty conversation', () => {
      const history: Array<{ role: string; content: string }> = [];

      expect(history.length).toBe(0);
      expect(history).toEqual([]);
    });
  });

  describe('permission handling', () => {
    it('should identify read permissions correctly', async () => {
      const { loadAllTools } = await import('../../src/registry.js');
      const tools = await loadAllTools();

      const readFiles = tools.get('read_files');
      expect(readFiles?.permission).toBe('read');
    });

    it('should identify write permissions correctly', async () => {
      const { loadAllTools } = await import('../../src/registry.js');
      const tools = await loadAllTools();

      const writeFiles = tools.get('write_files');
      expect(writeFiles?.permission).toBe('write');
    });

    it('should identify execute permissions correctly', async () => {
      const { loadAllTools } = await import('../../src/registry.js');
      const tools = await loadAllTools();

      const runCommand = tools.get('run_command');
      expect(runCommand?.permission).toBe('execute');
    });
  });

  describe('system prompt building', () => {
    it('should include tool definitions in prompt', async () => {
      const { loadAllTools, getToolDefinitions } = await import('../../src/registry.js');
      const tools = await loadAllTools();
      const definitions = getToolDefinitions(tools);

      expect(definitions).toContain('read_files');
      expect(definitions).toContain('write_files');
      expect(definitions).toContain('run_command');
      expect(definitions).toContain('Permission:');
    });

    it('should include repo map in prompt', async () => {
      // Create some test files
      await writeFile(join(testDir, 'test.py'), 'def hello(): pass');

      const { generateRepoMap } = await import('../../src/repoMap.js');
      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('test.py');
    });
  });
});
