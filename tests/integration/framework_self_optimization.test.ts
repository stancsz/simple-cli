import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameworkOptimizerServer } from '../../src/mcp_servers/framework_optimizer/index.js';
import { MCP } from '../../src/mcp.js';
import { createLLM } from '../../src/llm.js';
import { join } from 'path';
import { readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Mock dependencies
vi.mock('../../src/mcp.js');
vi.mock('../../src/llm.js');

describe('Framework Self-Optimization Integration', () => {
  let server: FrameworkOptimizerServer;
  const mockBrainClient = {
    callTool: vi.fn()
  };
  const mockLLM = {
    generate: vi.fn()
  };

  const sopsDir = join(process.cwd(), "sops", "framework_integration");
  const outputFile = join(sopsDir, "optimized_patterns.md");

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock MCP
    (MCP as any).mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      startServer: vi.fn().mockResolvedValue(undefined),
      getClient: vi.fn().mockReturnValue(mockBrainClient),
      stopServer: vi.fn().mockResolvedValue(undefined)
    }));

    // Mock LLM
    (createLLM as any).mockReturnValue(mockLLM);

    // Ensure output dir exists (in case it wasn't created)
    if (!existsSync(sopsDir)) {
        await mkdir(sopsDir, { recursive: true });
    }

    server = new FrameworkOptimizerServer();
  });

  afterEach(async () => {
    if (existsSync(outputFile)) {
        await unlink(outputFile);
    }
  });

  it('should analyze outcomes and generate optimization proposal', async () => {
    // 1. Mock Brain query response
    const mockOutcomes = [
      {
        taskId: 'task-1',
        request: 'Integrate cli-tool-v1',
        solution: 'Outcome: success',
        tokens: 100,
        duration: 5000
      },
      {
        taskId: 'task-2',
        request: 'Integrate sdk-tool-v2',
        solution: 'Outcome: failure',
        tokens: 50,
        duration: 2000
      }
    ];

    mockBrainClient.callTool.mockImplementation(async (args: any) => {
      if (args.name === 'brain_query') {
        return {
          content: [{ text: JSON.stringify(mockOutcomes) }]
        };
      }
      if (args.name === 'brain_store') {
        return { content: [{ text: 'Stored' }] };
      }
      return { content: [] };
    });

    // 2. Mock LLM response
    mockLLM.generate.mockResolvedValue({
      message: '# Optimization Proposal\n\n1. Use better prompts.',
      raw: '# Optimization Proposal\n\n1. Use better prompts.'
    });

    // 3. Run optimization
    const result = await server.proposeOptimization(5);

    // 4. Verify results
    if (result && result.content && result.content[0]) {
        expect(result.content[0].text).toContain('Optimization proposal generated');
    } else {
        throw new Error("Result content is undefined");
    }

    // Verify Brain Query
    expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'brain_query',
      arguments: expect.objectContaining({
        type: 'framework_integration_outcome'
      })
    }));

    // Verify LLM Call
    expect(mockLLM.generate).toHaveBeenCalled();
    const prompt = mockLLM.generate.mock.calls[0][0];
    expect(prompt).toContain('Analyze the following integration outcomes');

    // Verify File Creation
    const fileContent = await readFile(outputFile, 'utf-8');
    expect(fileContent).toContain('# Optimization Proposal');

    // Verify Brain Store
    expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'brain_store',
      arguments: expect.objectContaining({
        type: 'framework_optimization_proposal'
      })
    }));
  });

  it('should handle empty outcomes gracefully', async () => {
     mockBrainClient.callTool.mockImplementation(async (args: any) => {
      if (args.name === 'brain_query') {
        return { content: [{ text: '[]' }] }; // Empty array
      }
      return { content: [] };
    });

    const result = await server.proposeOptimization(5);
    if (result && result.content && result.content[0]) {
        expect(result.content[0].text).toContain('No framework integration outcomes found');
    } else {
        throw new Error("Result content is undefined");
    }
    expect(mockLLM.generate).not.toHaveBeenCalled();
  });
});
