import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SOPExecutor } from '../executor.js';
import { parseSOP } from '../sop_parser.js';
import { LLM } from '../../llm.js';
import { MCP } from '../../mcp.js';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Mock LLM and MCP
vi.mock('../../llm.js', () => {
  return {
    LLM: vi.fn().mockImplementation(() => ({
      generate: vi.fn(),
    })),
    createLLM: vi.fn().mockImplementation(() => new LLM({ provider: 'mock', model: 'mock' })),
  };
});

vi.mock('../../mcp.js', () => {
  return {
    MCP: vi.fn().mockImplementation(() => ({
      init: vi.fn(),
      getTools: vi.fn(),
    })),
  };
});

vi.mock('fs/promises');
vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual,
        existsSync: vi.fn(),
        mkdirSync: vi.fn(), // Also mocked just in case
    };
});


describe('SOP Engine Integration', () => {
  let llm: any;
  let mcp: any;
  let executor: SOPExecutor;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    llm = new LLM({ provider: 'mock', model: 'mock' });
    mcp = new MCP();
    executor = new SOPExecutor(llm, mcp);

    // Mock fs
    (fs.writeFile as any).mockResolvedValue(undefined);
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.readFile as any).mockResolvedValue('[]');
    (existsSync as any).mockReturnValue(true);
  });

  describe('SOP Parser', () => {
    it('should correctly parse a valid SOP', () => {
      const content = `
# Test SOP

This is a test description.

1. **Step One** Do something.
2. **Step Two** Do something else.
      `;
      const sop = parseSOP(content);
      expect(sop.title).toBe('Test SOP');
      expect(sop.description).toBe('This is a test description.');
      expect(sop.steps).toHaveLength(2);
      expect(sop.steps[0].name).toBe('Step One');
      expect(sop.steps[0].number).toBe(1);
      expect(sop.steps[1].name).toBe('Step Two');
    });
  });

  describe('SOP Executor', () => {
    it('should execute a simple SOP successfully', async () => {
      const sop = {
        title: 'Simple SOP',
        description: 'A simple test SOP',
        steps: [
          { number: 1, name: 'Step 1', description: 'Run step 1' },
          { number: 2, name: 'Step 2', description: 'Run step 2' }
        ]
      };

      // Mock MCP Tools
      const mockTools = [
        {
          name: 'brain_query',
          execute: vi.fn().mockResolvedValue('No past experience.')
        },
        {
          name: 'log_experience',
          execute: vi.fn().mockResolvedValue('Logged.')
        },
        {
          name: 'test_tool',
          execute: vi.fn().mockResolvedValue('Tool executed.')
        }
      ];
      mcp.getTools.mockResolvedValue(mockTools);

      // Mock LLM Responses
      let step1Done = false;

      llm.generate.mockImplementation(async (system: string, history: any[]) => {
        // State machine based on prompts and history
        if (system.includes('Step 1')) {
           if (!history.some(h => h.content.includes("Tool 'test_tool' output"))) {
             return { tool: 'test_tool', args: {}, thought: 'Running test tool' };
           } else {
             step1Done = true;
             return { tool: 'complete_step', args: { summary: 'Step 1 done' }, thought: 'Completing step 1' };
           }
        } else if (system.includes('Step 2')) {
           return { tool: 'complete_step', args: { summary: 'Step 2 done' }, thought: 'Completing step 2' };
        }
        return { tool: 'none', message: 'I am confused' };
      });

      const result = await executor.execute(sop, 'input');

      expect(result).toContain("SOP 'Simple SOP' executed successfully");
      expect(mcp.getTools).toHaveBeenCalled();
      expect(mockTools[0].execute).toHaveBeenCalled(); // brain_query
      expect(mockTools[1].execute).toHaveBeenCalled(); // log_experience
      expect(mockTools[2].execute).toHaveBeenCalled(); // test_tool
    });

    it('should retry on failure and eventually succeed', async () => {
        const sop = {
          title: 'Retry SOP',
          description: 'Testing retries',
          steps: [
            { number: 1, name: 'Fail Once', description: 'This step fails initially' }
          ]
        };

        // Mock MCP Tools
        const mockTools = [
          { name: 'brain_query', execute: vi.fn().mockResolvedValue('') },
          { name: 'log_experience', execute: vi.fn().mockResolvedValue('') },
          {
              name: 'flaky_tool',
              execute: vi.fn()
                  .mockRejectedValueOnce(new Error('Network error')) // Fail 1st time
                  .mockResolvedValue('Success')                      // Succeed 2nd time
          }
        ];
        mcp.getTools.mockResolvedValue(mockTools);

        // Mock LLM Responses
        llm.generate.mockImplementation(async (system: string, history: any[]) => {
            // Check history to see if we failed
            const lastUserMsg = history[history.length - 1];

            if (lastUserMsg && lastUserMsg.content.includes("Tool 'flaky_tool' failed")) {
                // Retry
                 return { tool: 'flaky_tool', args: {}, thought: 'Retrying flaky tool' };
            }

            if (lastUserMsg && lastUserMsg.content.includes("Tool 'flaky_tool' output: Success")) {
                return { tool: 'complete_step', args: { summary: 'Done' } };
            }

            // Default: try tool
            return { tool: 'flaky_tool', args: {}, thought: 'Trying flaky tool' };
        });

        const result = await executor.execute(sop, 'input');
        expect(result).toContain("SOP 'Retry SOP' executed successfully");
        expect(mockTools[2].execute).toHaveBeenCalledTimes(2); // Once fail, once success
    });

    it('should fail if retries exhausted', async () => {
         const sop = {
            title: 'Fail SOP',
            description: 'Testing failure',
            steps: [{ number: 1, name: 'Always Fail', description: 'This step always fails' }]
          };

          // Mock MCP Tools
          const mockTools = [
            { name: 'brain_query', execute: vi.fn().mockResolvedValue('') },
            { name: 'log_experience', execute: vi.fn().mockResolvedValue('') },
          ];
          mcp.getTools.mockResolvedValue(mockTools);

          // Mock LLM to throw error directly (simulating API failure)
          llm.generate.mockImplementation(async () => {
              throw new Error("LLM Generation Failed");
          });

          await expect(executor.execute(sop, 'input')).rejects.toThrow('Failed to complete Step 1 after 3 retries.');
    });
  });
});
