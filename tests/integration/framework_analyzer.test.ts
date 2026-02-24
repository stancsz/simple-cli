import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyze_cli_tool, generate_mcp_scaffold } from '../../src/mcp_servers/framework_analyzer/tools.js';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';
import * as cp from 'child_process';

// Mock LLM
const mockGenerate = vi.fn();
const mockLLMInstance = {
  generate: mockGenerate,
  embed: vi.fn(),
  personaEngine: {
    loadConfig: vi.fn(),
    injectPersonality: vi.fn((s) => s),
    transformResponse: vi.fn((r) => r),
  }
};

vi.mock('../../src/llm.js', () => {
  return {
    createLLM: vi.fn(() => mockLLMInstance),
    LLM: vi.fn()
  };
});

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
    return {
        execFile: vi.fn((cmd, args, cb) => {
             // promisify(execFile) passes (cmd, args, cb)
             // or (cmd, options, cb) etc.
             // We expect (cmd, ['--help'], cb)
             const callback = typeof args === 'function' ? args : cb;
             // Simulate success
             if (callback) callback(null, { stdout: "Usage: mocked tool help", stderr: "" });
             return {} as any;
        }),
        exec: vi.fn()
    };
});

describe('Framework Analyzer Integration', () => {
  const TEST_DIR = join(process.cwd(), 'src', 'mcp_servers', 'test_framework');

  beforeEach(async () => {
    mockGenerate.mockReset();
    vi.mocked(cp.execFile).mockClear();
    vi.mocked(cp.exec).mockClear();
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  it('should analyze CLI help text correctly', async () => {
    const mockHelpText = `
      Usage: mytool <command> [options]
      Commands:
        list    List items
    `;

    const mockAnalysis = {
      tool: "analysis_result",
      args: {
        description: "My Tool Description",
        tools: [{ name: "list_items", description: "List items", args: [] }]
      }
    };

    mockGenerate.mockResolvedValue({
      thought: "Analyzing help text...",
      tool: "analysis_result",
      args: mockAnalysis.args,
      raw: JSON.stringify(mockAnalysis),
      usage: { totalTokens: 100, promptTokens: 50, completionTokens: 50 }
    });

    const result = await analyze_cli_tool('mytool', mockHelpText);

    expect(mockGenerate).toHaveBeenCalled();
    expect(result).toEqual(mockAnalysis.args);
  });

  it('should use execFile for security when help_text is missing', async () => {
      mockGenerate.mockResolvedValue({
          tool: "analysis_result",
          args: { description: "mocked", tools: [] }
      });

      await analyze_cli_tool('secure_cmd');

      expect(cp.execFile).toHaveBeenCalledWith('secure_cmd', ['--help'], expect.any(Function));
      expect(cp.exec).not.toHaveBeenCalled();
  });

  it('should generate MCP scaffold files', async () => {
    const mockAnalysisResult = { description: "My Tool", tools: [] };
    const mockFiles = {
      files: {
        "index.ts": "console.log('hello');",
        "README.md": "# My Tool",
        "config.json": "{}"
      }
    };

    mockGenerate.mockResolvedValue({
      thought: "Generating scaffold...",
      tool: "scaffold_result",
      args: mockFiles,
      raw: JSON.stringify(mockFiles),
      usage: { totalTokens: 100, promptTokens: 50, completionTokens: 50 }
    });

    const result = await generate_mcp_scaffold('test_framework', mockAnalysisResult);

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(3);

    const indexContent = await readFile(join(TEST_DIR, 'index.ts'), 'utf-8');
    expect(indexContent).toBe("console.log('hello');");
  });
});
