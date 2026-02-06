
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TypeLLM } from '../src/lib/typellm';

describe('TypeLLM Google Provider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        process.env.GOOGLE_API_KEY = 'test-google-key';
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.unstubAllGlobals();
    });

    it('should call Gemini API with correct payload', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{ text: '{"thought": "test", "tool": "none", "args": {}}' }]
                    }
                }]
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        const llm = new TypeLLM({
            provider: 'google',
            model: 'gemini-2.0-flash',
            apiKey: 'test-key'
        });

        const messages = [
            { role: 'user' as const, content: 'Hello' }
        ];

        // Ensure we don't disable live LLM
        process.env.DISABLE_LIVE_LLM = 'false';

        await llm.generate('System prompt', messages, { strict: true });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key');
        expect(options.method).toBe('POST');

        const body = JSON.parse(options.body as string);
        expect(body).toMatchObject({
            contents: [
                { role: 'user', parts: [{ text: 'Hello' }] }
            ],
            systemInstruction: {
                parts: [{ text: expect.stringContaining('System prompt') }]
            }
        });
    });

    it('should handle models/ prefix in model name correctly', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{ text: '{"thought": "test", "tool": "none", "args": {}}' }]
                    }
                }]
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        const llm = new TypeLLM({
            provider: 'google',
            model: 'models/gemini-1.5-pro',
            apiKey: 'test-key'
        });

        // Ensure we don't disable live LLM
        process.env.DISABLE_LIVE_LLM = 'false';

        await llm.generate('System', [], { strict: false });

        const [url] = fetchMock.mock.calls[0];
        expect(url).toContain('/models/gemini-1.5-pro:generateContent');
    });
});
