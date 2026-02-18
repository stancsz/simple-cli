import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWeeklyReview } from '../../src/scheduler/jobs/weekly_review_job.js';

// Mock MCP
const mockCallTool = vi.fn();
const mockInit = vi.fn();
const mockStartServer = vi.fn();
const mockGetClient = vi.fn();
const mockIsServerRunning = vi.fn(() => true);

vi.mock('../../src/mcp.js', () => {
  return {
    MCP: vi.fn().mockImplementation(() => ({
      init: mockInit,
      startServer: mockStartServer,
      getClient: mockGetClient,
      isServerRunning: mockIsServerRunning
    }))
  };
});

describe('Weekly Review Job', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClient.mockImplementation((name: string) => {
            if (name === 'hr' || name === 'brain' || name === 'core_updater') {
                return { callTool: mockCallTool };
            }
            return null;
        });
        mockIsServerRunning.mockReturnValue(true);
    });

    it('should run weekly review and propose nothing if output is empty', async () => {
        mockCallTool.mockImplementation(async (args: any) => {
             if (args.name === 'perform_weekly_review') {
                 return { content: [{ type: 'text', text: 'Analysis complete. No changes.' }] };
             }
             if (args.name === 'log_experience') {
                 return { content: [] };
             }
             return { content: [] };
        });

        const taskDef: any = {
            id: 'test-task',
            name: 'Weekly Review',
            trigger: 'cron',
            prompt: 'Run review',
            yoloMode: true,
            company: 'test-company'
        };

        await runWeeklyReview(taskDef);

        expect(mockInit).toHaveBeenCalled();
        expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'perform_weekly_review' }));
        expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'log_experience' }));
    });

    it('should parse proposal and apply core update in YOLO mode', async () => {
        const proposalJson = JSON.stringify({
            title: 'Fix Bug',
            description: 'Fixing a bug',
            changes: [{ filepath: 'src/bug.ts', newContent: 'fixed' }]
        });

        const hrOutput = `
Analysis Complete. CORE UPDATE REQUIRED.
Proposed Changes (JSON):
\`\`\`json_proposal
${proposalJson}
\`\`\`
Patch/Instructions:
...
        `;

        mockCallTool.mockImplementation(async (args: any) => {
             if (args.name === 'perform_weekly_review') {
                 return { content: [{ type: 'text', text: hrOutput }] };
             }
             if (args.name === 'propose_core_update') {
                 return { content: [{ type: 'text', text: 'Proposal Created.\nID: update-123\nRisk Level: low\nApproval Token: token-abc' }] };
             }
             if (args.name === 'apply_core_update') {
                 return { content: [{ type: 'text', text: 'Update Applied Successfully.' }] };
             }
             return { content: [] };
        });

        const taskDef: any = {
            id: 'test-task',
            name: 'Weekly Review',
            trigger: 'cron',
            prompt: 'Run review',
            yoloMode: true
        };

        await runWeeklyReview(taskDef);

        expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'propose_core_update',
            arguments: expect.objectContaining({
                changes: [{ filepath: 'src/bug.ts', newContent: 'fixed' }]
            })
        }));

        expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'apply_core_update',
            arguments: {
                update_id: 'update-123',
                approval_token: 'token-abc'
            }
        }));
    });
});
