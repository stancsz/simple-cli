import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyze_framework_source } from '../../src/mcp_servers/framework_analyzer/tools.js';

// --- Mocks ---

// 1. Mock child_process for CLI execution
const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  execFile: (cmd: string, args: string[], callback: any) => mockExecFile(cmd, args, callback),
}));

// 2. Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (path: string, encoding: string) => mockReadFile(path, encoding),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// 3. Mock LLM
const mockLLMGenerate = vi.fn();
vi.mock('../../src/llm.js', () => ({
  createLLM: () => ({
    generate: mockLLMGenerate,
  }),
}));

// 4. Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Framework Analyzer Enhanced Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyze_framework_source', () => {

    // Test Case 1: SDK Analysis (File)
    it('should analyze an SDK from a local file', async () => {
      const sourcePath = '/path/to/sdk-spec.json';
      const fileContent = '{"openapi": "3.0.0", "info": {"title": "Test SDK"}}';

      mockReadFile.mockResolvedValue(fileContent);

      const expectedAnalysis = {
        description: "Test SDK",
        tools: [
            { name: "test_tool", description: "A tool", args: [] }
        ]
      };

      mockLLMGenerate.mockResolvedValue({
        tool: "analysis_result",
        args: expectedAnalysis
      });

      const result = await analyze_framework_source('sdk', sourcePath);

      expect(mockReadFile).toHaveBeenCalledWith(sourcePath, 'utf-8');
      expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
      // Verify prompt contains file content
      const promptCall = mockLLMGenerate.mock.calls[0];
      expect(promptCall[1][0].content).toContain(fileContent);
      expect(result).toEqual(expectedAnalysis);
    });

    // Test Case 2: SDK Analysis (URL)
    it('should analyze an SDK from a URL', async () => {
      const sourceUrl = 'https://api.example.com/spec.json';
      const urlContent = 'type SDK = { method: () => void }';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(urlContent)
      });

      const expectedAnalysis = {
        description: "Remote SDK",
        tools: []
      };

      mockLLMGenerate.mockResolvedValue({
        tool: "analysis_result",
        args: expectedAnalysis
      });

      const result = await analyze_framework_source('sdk', sourceUrl);

      expect(mockFetch).toHaveBeenCalledWith(sourceUrl);
      expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedAnalysis);
    });

    // Test Case 3: GUI Analysis
    it('should provide a recommendation for GUI sources', async () => {
      const sourcePath = 'Cursor App';

      const result = await analyze_framework_source('gui', sourcePath);

      expect(result).toHaveProperty('tool', 'analysis_result');
      expect(result.args).toHaveProperty('recommendation');
      expect(result.args.recommendation).toContain('GUI-based application');
      expect(result.args).toHaveProperty('suggested_strategy');
      expect(result.args.suggested_strategy).toContain('Desktop Orchestrator');
      expect(result.args.next_steps[0]).toContain('desktop_orchestrator');
    });

    // Test Case 4: CLI Analysis (Delegation)
    it('should delegate to analyze_cli_tool for CLI sources', async () => {
      const targetCommand = 'git';
      const helpText = 'usage: git ...';

      mockExecFile.mockImplementation((cmd, args, callback) => {
          if (cmd === targetCommand && args.includes('--help')) {
              callback(null, { stdout: helpText, stderr: '' });
          }
      });

      const expectedAnalysis = { description: "Git CLI" };
      mockLLMGenerate.mockResolvedValue({
        tool: "analysis_result",
        args: expectedAnalysis
      });

      const result = await analyze_framework_source('cli', targetCommand);

      expect(mockExecFile).toHaveBeenCalledWith(targetCommand, ['--help'], expect.any(Function));
      expect(result).toEqual(expectedAnalysis);
    });

    // Error Handling: Fetch Fail
    it('should handle fetch errors', async () => {
        const sourceUrl = 'https://bad-url.com';
        mockFetch.mockResolvedValue({
            ok: false,
            statusText: 'Not Found'
        });

        const result = await analyze_framework_source('sdk', sourceUrl);

        expect(result).toHaveProperty('error');
        expect(result.error).toContain('Failed to read source path');
    });

    // Error Handling: ReadFile Fail
    it('should handle file read errors', async () => {
        const sourcePath = '/nonexistent';
        mockReadFile.mockRejectedValue(new Error('ENOENT'));

        const result = await analyze_framework_source('sdk', sourcePath);

        expect(result).toHaveProperty('error');
        expect(result.error).toContain('Failed to read source path');
    });
  });
});
