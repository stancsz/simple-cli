
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run_swe_agent } from '../../src/mcp_servers/swe_agent/tools.js';
import { builtinSkills } from '../../src/skills.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises for writeFile/unlink to avoid side effects on disk during test
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('SWE-agent Integration', () => {
  let mockSpawn: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
  });

  it('should execute swe-agent with correct arguments for issue_url', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    mockSpawn.mockReturnValue(mockProcess);

    // Simulate process completion
    setTimeout(() => {
        mockProcess.stdout.emit('data', 'SWE-agent started\n');
        mockProcess.emit('close', 0);
    }, 10);

    const result = await run_swe_agent('gpt4', 'https://github.com/test/repo/issues/1');

    expect(mockSpawn).toHaveBeenCalledWith('swe-agent', expect.objectContaining({
        0: '--model_name',
        1: 'gpt4',
        2: '--issue_url',
        3: 'https://github.com/test/repo/issues/1'
    }), expect.anything());

    // Better array check
    const calls = mockSpawn.mock.calls[0];
    expect(calls[0]).toBe('swe-agent');
    expect(calls[1]).toEqual(['--model_name', 'gpt4', '--issue_url', 'https://github.com/test/repo/issues/1']);

    expect(result).toEqual({
      content: [{ type: 'text', text: expect.stringContaining('SWE-agent completed successfully') }]
    });
  });

  it('should handle repo_path and config_file', async () => {
     const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess);
    setTimeout(() => { mockProcess.emit('close', 0); }, 10);

     await run_swe_agent('claude', 'https://github.com/issue/2', '/local/repo', 'config.yaml');

     const calls = mockSpawn.mock.calls[0];
     expect(calls[1]).toEqual([
       '--model_name', 'claude',
       '--config_file', 'config.yaml',
       '--issue_url', 'https://github.com/issue/2',
       '--repo_path', '/local/repo'
     ]);
  });

  it('should handle problem_description by creating a temp file', async () => {
     const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess);
    setTimeout(() => { mockProcess.emit('close', 0); }, 10);

    await run_swe_agent('gpt4', undefined, undefined, undefined, 'Fix the bug');

    const calls = mockSpawn.mock.calls[0];
    const args = calls[1];

    expect(args).toContain('--data_path');
    const dataPathIndex = args.indexOf('--data_path');
    expect(args[dataPathIndex + 1]).toMatch(/swe-agent-issue-.*\.json/);
  });

  it('should return error if neither issue_url nor problem_description is provided', async () => {
    const result = await run_swe_agent('gpt4');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Either issue_url or problem_description must be provided');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should include SWE-agent in the Smart Router system prompt', () => {
    const prompt = builtinSkills.code.systemPrompt;
    expect(prompt).toContain("Issue Reproduction / Debugging");
    expect(prompt).toContain("'swe_agent'");
  });
});
