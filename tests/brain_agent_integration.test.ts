import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobDelegator } from '../src/scheduler/job_delegator.js';
import { ReviewerAgent } from '../src/agents/reviewer_agent.js';
import { TaskDefinition } from '../src/daemon/task_definitions.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { mockCallTool, mockInit, mockStartServer, mockGetClient } from './mocks/mcp_client.js';

// Mock MCP
vi.mock('../src/mcp.js', async () => {
    return await vi.importActual('./mocks/mcp_client.js');
});

// Mock Trigger to avoid actual execution
vi.mock('../src/scheduler/trigger.js', () => ({
  handleTaskTrigger: vi.fn().mockResolvedValue({ exitCode: 0 })
}));

describe('Brain Agent Integration', () => {
  const agentDir = path.join(process.cwd(), '.test-agent');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCallTool.mockReset();
    mockGetClient.mockReturnValue({
        callTool: mockCallTool
    });
    // Clean up test logs
    try {
        await fs.rm(agentDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Job Delegator', () => {
    it('should log experience and recall patterns when delegating task', async () => {
      // Setup mock return for recall
      mockCallTool.mockImplementation(async ({ name }) => {
        if (name === 'recall_delegation_patterns') {
            return {
                content: [{ type: 'text', text: 'Found relevant patterns.' }]
            };
        }
        return { content: [] };
      });

      const delegator = new JobDelegator(agentDir);
      const task: TaskDefinition = {
        id: 'test-task-1',
        name: 'test-task',
        trigger: 'cron',
        prompt: 'Do something',
        company: 'test-company'
      };

      await delegator.delegateTask(task);

      // Verify MCP Init
      expect(mockInit).toHaveBeenCalled();
      expect(mockStartServer).toHaveBeenCalledWith('brain');

      // Verify Recall Pattern Call
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'recall_delegation_patterns',
        arguments: {
          task_type: 'test-task',
          company: 'test-company'
        }
      });

      // Verify Log Experience Call
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'log_experience',
        arguments: expect.objectContaining({
            taskId: 'test-task-1',
            task_type: 'test-task',
            outcome: 'success',
            company: 'test-company'
        })
      });
    });
  });

  describe('Reviewer Agent', () => {
    it('should log review outcome', async () => {
      const reviewer = new ReviewerAgent();
      const task: TaskDefinition = {
        id: 'test-task-2',
        name: 'review-target',
        trigger: 'cron',
        prompt: 'Review me',
        company: 'test-company'
      };
      const artifacts = ['file1.ts', 'file2.ts'];

      await reviewer.reviewTask(task, artifacts);

      // Verify MCP Init
      expect(mockInit).toHaveBeenCalled();

      // Verify Log Experience Call
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'log_experience',
        arguments: expect.objectContaining({
            task_type: 'review',
            agent_used: 'reviewer-agent',
            outcome: 'approved',
            company: 'test-company',
            artifacts: JSON.stringify(artifacts)
        })
      });
    });
  });
});
