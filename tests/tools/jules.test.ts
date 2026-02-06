import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute } from '../../src/tools/jules.js';

describe('jules tool - sync_pr', () => {
    const originalEnv = process.env;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        process.env = { ...originalEnv, JULES_API_KEY: 'test-key' };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env = originalEnv;
    });

    it('should return PR URL immediately if present', async () => {
        const sessionId = 'test-session';
        const prUrl = 'https://github.com/owner/repo/pull/1';

        // Mock session response with PR
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                outputs: [{ pullRequest: { url: prUrl } }]
            })
        });

        const result = await execute({
            action: 'sync_pr',
            sessionId
        });

        expect(result).toEqual({ prUrl });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return PR URL after polling', async () => {
        const sessionId = 'test-session';
        const prUrl = 'https://github.com/owner/repo/pull/1';

        // 1. First call: No PR
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ outputs: [] })
        });

        // 2. Second call: PR exists
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                outputs: [{ pullRequest: { url: prUrl } }]
            })
        });

        const result = await execute({
            action: 'sync_pr',
            sessionId
        });

        expect(result).toEqual({ prUrl });
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return activities if PR not found after polling', async () => {
        const sessionId = 'test-session';

        // Mock 5 session checks without PR
        for (let i = 0; i < 5; i++) {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ outputs: [] })
            });
        }

        // Mock activities response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                activities: [
                    { createTime: '2023-01-01', originator: 'Jules', progressUpdated: { title: 'Thinking' } }
                ]
            })
        });

        const result = await execute({
            action: 'sync_pr',
            sessionId
        });

        expect(result).toHaveProperty('summary');
        expect(result.activities).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(6); // 5 checks + 1 activities
    });

    it('should fail if session ID is missing', async () => {
        await expect(execute({
            action: 'sync_pr'
        })).rejects.toThrow();
    });
});
