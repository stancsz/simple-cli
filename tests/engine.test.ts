import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Engine, Context, Registry, Tool } from '../src/engine/orchestrator';
import { LLM } from '../src/llm';
import { MCP } from '../src/mcp';
import { Skill } from '../src/skills';

// Mock dependencies
vi.mock('../src/llm');
vi.mock('../src/mcp');

describe('Engine (Smart Router Integration)', () => {
  let engine: Engine;
  let mockLLM: any;
  let mockMCP: any;
  let registry: Registry;
  let context: Context;

  beforeEach(() => {
    mockLLM = {
      generate: vi.fn(),
    };
    mockMCP = {
      init: vi.fn(),
      listServers: vi.fn().mockReturnValue([]),
      getTools: vi.fn().mockResolvedValue([]),
      getClient: vi.fn().mockReturnValue(undefined), // No brain/context by default
      startServer: vi.fn(),
    };
    registry = new Registry();

    // Create engine instance
    engine = new Engine(mockLLM as unknown as LLM, registry, mockMCP as unknown as MCP);

    // Setup basic context
    const skill: Skill = {
      name: 'TestSkill',
      description: 'Test',
      systemPrompt: 'You are a test agent.',
      triggers: [],
      ops: []
    };
    context = new Context('/tmp/test-cwd', skill);

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should route task to run_crew_task when LLM decides to', async () => {
    // 1. Mock MCP to provide run_crew_task tool
    const crewTool: Tool = {
      name: 'run_crew_task',
      description: 'Run a task using CrewAI',
      execute: vi.fn().mockResolvedValue({ status: 'success', output: 'Task completed by CrewAI' })
    };
    mockMCP.getTools.mockResolvedValue([crewTool]);

    // 2. Mock LLM to select run_crew_task
    mockLLM.generate.mockResolvedValueOnce({
      thought: 'I should delegate this to CrewAI.',
      tool: 'run_crew_task',
      args: { task: 'Research quantum computing' }
    });
    // Second call: Supervisor QA check
    mockLLM.generate.mockResolvedValueOnce({
      message: 'Verified. The result looks correct.'
    });
    // Third call: Final completion
    mockLLM.generate.mockResolvedValueOnce({
      thought: 'Task is done.',
      message: 'Here is the result.',
    });

    // 3. Run engine
    // We use a non-interactive run. Engine.run is an infinite loop unless input is undefined.
    // In test environment, we can pass initialPrompt.
    // However, Engine.run loops. We need to make sure it breaks.
    // The loop breaks if `input` is undefined (after user input prompt returns undefined).
    // In our test, we pass initialPrompt. It processes it. Then it loops again.
    // Then it calls `getUserInput`. If not interactive, `getUserInput` returns undefined.
    // So it should break.
    await engine.run(context, 'Please research quantum computing', { interactive: false });

    // 4. Verify tool execution
    expect(crewTool.execute).toHaveBeenCalledWith(
      { task: 'Research quantum computing' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mockMCP.getTools).toHaveBeenCalled();
  });

  it('should route task to aider_edit when LLM decides to', async () => {
    // 1. Mock MCP to provide aider_edit tool
    const aiderTool: Tool = {
      name: 'aider_edit',
      description: 'Edit files using Aider',
      execute: vi.fn().mockResolvedValue({ content: [{ text: 'Files edited' }] })
    };
    mockMCP.getTools.mockResolvedValue([aiderTool]);

    // 2. Mock LLM to select aider_edit
    mockLLM.generate.mockResolvedValueOnce({
      thought: 'I need to use Aider to edit the file.',
      tool: 'aider_edit',
      args: { task: 'Fix bug in server.ts', context_files: ['src/server.ts'] }
    });
    // Second call to verify output (Supervisor)
    mockLLM.generate.mockResolvedValueOnce({
      message: 'Verified. Looks good.'
    });
    // Third call to finish
    mockLLM.generate.mockResolvedValueOnce({
      thought: 'Work is done.',
      message: 'Bug fixed.'
    });

    // 3. Run engine
    await engine.run(context, 'Fix the bug in server.ts', { interactive: false });

    // 4. Verify tool execution
    expect(aiderTool.execute).toHaveBeenCalledWith(
      { task: 'Fix bug in server.ts', context_files: ['src/server.ts'] },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
