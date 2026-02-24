import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { analyze_cli_tool, generate_mcp_scaffold } from '../../src/mcp_servers/framework_analyzer/tools.js';

// --- Mocks ---

// 1. Mock child_process for CLI execution
const mockExecFile = vi.fn();
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  execFile: (cmd: string, args: string[], callback: any) => mockExecFile(cmd, args, callback),
  exec: (cmd: string, options: any, callback: any) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    mockExec(cmd, options, callback);
  },
}));

// 2. Mock fs/promises for file operations
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock('fs/promises', () => ({
  writeFile: (path: string, content: string) => mockWriteFile(path, content),
  mkdir: (path: string, options?: any) => mockMkdir(path, options),
}));

// 3. Mock LLM for analysis and scaffold generation
const mockLLMGenerate = vi.fn();
vi.mock('../../src/llm.js', () => ({
  createLLM: () => ({
    generate: mockLLMGenerate,
  }),
}));

describe('Framework Analyzer Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyze_cli_tool', () => {
    it('should analyze a CLI tool using its help text', async () => {
      // Setup
      const targetCommand = 'git';
      const helpText = 'usage: git [--version] ...';

      // Mock execFile to return help text
      mockExecFile.mockImplementation((cmd, args, callback) => {
        if (cmd === targetCommand && args.includes('--help')) {
          callback(null, { stdout: helpText, stderr: '' });
        } else {
          callback(new Error('Command not found'), { stdout: '', stderr: '' });
        }
      });

      // Mock LLM response for analysis
      const expectedAnalysis = {
        description: "Git version control system",
        usage_patterns: ["git commit", "git push"],
        tools: [
          {
            name: "git_commit",
            description: "Record changes to the repository",
            args: [{ name: "message", type: "string", description: "Commit message" }]
          }
        ]
      };

      mockLLMGenerate.mockResolvedValueOnce({
        tool: "analysis_result",
        args: expectedAnalysis,
        raw: JSON.stringify({ tool: "analysis_result", args: expectedAnalysis })
      });

      // Execute
      const result = await analyze_cli_tool(targetCommand);

      // Verify
      expect(mockExecFile).toHaveBeenCalledWith(targetCommand, ['--help'], expect.any(Function));
      expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedAnalysis);
    });

    it('should handle CLI execution errors gracefully', async () => {
        // Setup
        const targetCommand = 'nonexistent';

        mockExecFile.mockImplementation((cmd, args, callback) => {
            callback(new Error('Command not found'), { stdout: '', stderr: 'Command not found' });
        });

        // Execute
        const result = await analyze_cli_tool(targetCommand);

        // Verify
        // If execFile fails, it might return the error object or try to proceed if help_text is provided.
        // In this case, no help text provided, so it should return an error.
        expect(result).toHaveProperty('error');
        expect(result.error).toContain('Failed to execute');
    });

    it('should use provided help_text if available', async () => {
        // Setup
        const targetCommand = 'custom-tool';
        const providedHelp = 'Usage: custom-tool [options]';

        const expectedAnalysis = {
            description: "Custom tool",
            tools: []
        };

        mockLLMGenerate.mockResolvedValueOnce({
            tool: "analysis_result",
            args: expectedAnalysis,
            raw: JSON.stringify({ tool: "analysis_result", args: expectedAnalysis })
        });

        // Execute
        const result = await analyze_cli_tool(targetCommand, providedHelp);

        // Verify
        expect(mockExecFile).not.toHaveBeenCalled();
        expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expectedAnalysis);
    });
  });

  describe('generate_mcp_scaffold', () => {
    it('should generate an MCP server scaffold', async () => {
      // Setup
      const frameworkName = 'test-framework';
      const analysisResult = {
        description: "Test Framework",
        tools: [{ name: "test_tool", description: "A test tool", args: [] }]
      };

      const generatedFiles = {
        "index.ts": "import { McpServer } from ...",
        "config.json": "{}",
        "README.md": "# Test Framework MCP"
      };

      mockLLMGenerate.mockResolvedValueOnce({
        tool: "scaffold_result",
        args: { files: generatedFiles },
        raw: JSON.stringify({ tool: "scaffold_result", args: { files: generatedFiles } })
      });

      // Execute
      const result = await generate_mcp_scaffold(frameworkName, analysisResult);

      // Verify
      expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(join('src', 'mcp_servers', frameworkName)), { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledTimes(3);
      expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining(join(frameworkName, 'index.ts')), generatedFiles['index.ts']);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('files');
      expect(result.files).toHaveLength(3);
    });

    it('should prevent path traversal in framework name', async () => {
      // Setup
      const frameworkName = '../malicious';
      const analysisResult = {};

      // Execute
      const result = await generate_mcp_scaffold(frameworkName, analysisResult);

      // Verify
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid framework name');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle LLM generation errors', async () => {
        // Setup
        const frameworkName = 'fail-framework';
        const analysisResult = {};

        mockLLMGenerate.mockRejectedValueOnce(new Error('LLM Failure'));

        // Execute
        const result = await generate_mcp_scaffold(frameworkName, analysisResult);

        // Verify
        expect(result).toHaveProperty('error');
        expect(result.error).toContain('Scaffold generation failed');
    });
  });
});
