import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healShowcase } from '../../src/mcp_servers/showcase_healer/healer.js';

describe('Showcase Healer Integration', () => {
    let mockMcp: any;
    let mockLlm: any;
    let mockEpisodic: any;

    beforeEach(() => {
        mockMcp = {
            callTool: vi.fn()
        };
        mockLlm = {
            generate: vi.fn()
        };
        mockEpisodic = {
            store: vi.fn(),
            recall: vi.fn().mockResolvedValue([]) // Default no history
        };
    });

    it('should do nothing if latest run was successful', async () => {
        // Mock health monitor response
        mockMcp.callTool.mockResolvedValueOnce({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    id: 'run-1',
                    timestamp: new Date().toISOString(),
                    success: true,
                    steps: []
                })
            }]
        });

        const result = await healShowcase({ mcp: mockMcp, llm: mockLlm, episodic: mockEpisodic });

        expect(result).toContain('No healing needed: Latest run was successful');
        expect(mockLlm.generate).not.toHaveBeenCalled();
    });

    it('should trigger retry_sop when LLM suggests it', async () => {
        // Mock health monitor response (failure)
        mockMcp.callTool.mockResolvedValueOnce({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    id: 'run-2',
                    timestamp: new Date().toISOString(),
                    success: false,
                    error: 'Timeout connecting to GitHub',
                    steps: [{ name: 'git_clone', status: 'failure' }]
                })
            }]
        });

        // Mock LLM response
        mockLlm.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                action: 'retry_sop',
                reason: 'Transient network error',
                sop_name: 'showcase_sop'
            })
        });

        // Mock sop execution
        mockMcp.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'SOP executed successfully' }]
        });

        const result = await healShowcase({ mcp: mockMcp, llm: mockLlm, episodic: mockEpisodic });

        // Verify analysis
        expect(mockLlm.generate).toHaveBeenCalled();

        // Verify SOP retry
        expect(mockMcp.callTool).toHaveBeenCalledWith('sop_engine', 'sop_execute', {
            name: 'showcase_sop',
            input: 'Healer retry'
        });

        // Verify Logging
        expect(mockEpisodic.store).toHaveBeenCalledWith(
            expect.stringContaining('heal_showcase_run-2'),
            'Heal showcase failure',
            expect.stringContaining('Action: retry_sop'),
            [],
            undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            'showcase_healing_episode',
            'run-2'
        );

        expect(result).toContain('Healed: retry_sop');
    });

    it('should trigger rebuild_brain when LLM suggests it', async () => {
        mockMcp.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: JSON.stringify({ id: 'run-brain', timestamp: new Date().toISOString(), success: false, error: 'Vector Error' }) }]
        });

        mockLlm.generate.mockResolvedValueOnce({
            message: JSON.stringify({ action: 'rebuild_brain', reason: 'Corruption' })
        });

        mockMcp.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Maintenance complete' }]
        });

        const result = await healShowcase({ mcp: mockMcp, llm: mockLlm, episodic: mockEpisodic });

        expect(mockMcp.callTool).toHaveBeenCalledWith('brain', 'brain_maintenance', { action: 'rebuild_indices' });
        expect(result).toContain('Brain maintenance: Maintenance complete');
    });

    it('should escalate if too many healing attempts exist', async () => {
        // Mock failure
        mockMcp.callTool.mockResolvedValueOnce({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    id: 'run-4',
                    timestamp: new Date().toISOString(),
                    success: false,
                    error: 'Fail'
                })
            }]
        });

        // Mock episodic recall returning 3 attempts
        mockEpisodic.recall.mockResolvedValueOnce([
            { related_episode_id: 'run-4', agentResponse: 'Action: retry_sop' },
            { related_episode_id: 'run-4', agentResponse: 'Action: retry_sop' },
            { related_episode_id: 'run-4', agentResponse: 'Action: retry_sop' }
        ]);

        const result = await healShowcase({ mcp: mockMcp, llm: mockLlm, episodic: mockEpisodic });

        expect(result).toContain('Escalated: Too many healing attempts');
        expect(mockLlm.generate).not.toHaveBeenCalled();
    });
});
