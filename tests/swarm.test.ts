import { describe, it, expect, vi } from 'vitest';
import { Server } from '../src/swarm/server.js';
import { RemoteWorker } from '../src/swarm/remote_worker.js';
import { Engine } from '../src/engine.js';

describe('Swarm', () => {
    it('RemoteWorker should send prompt to Server and Server should run Engine', async () => {
        const mockEngine = {
            run: vi.fn().mockResolvedValue(undefined)
        } as unknown as Engine;

        const server = new Server(mockEngine);
        const worker = new RemoteWorker(server);

        const prompt = 'Hello Swarm';
        const result = await worker.run(prompt);

        expect(mockEngine.run).toHaveBeenCalledTimes(1);
        expect(mockEngine.run).toHaveBeenCalledWith(
            expect.anything(), // Context
            prompt,
            { interactive: false }
        );
        expect(result).toEqual({ status: 'success', message: 'Agent executed prompt' });
    });

    it('Server should handle tool call correctly without running Engine', async () => {
        const mockEngine = {
            run: vi.fn().mockResolvedValue(undefined)
        } as unknown as Engine;

        const server = new Server(mockEngine);
        const toolCall = { tool_name: 'test_tool', args: { foo: 'bar' } };
        const result = await server.handle(toolCall);

        expect(mockEngine.run).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'success', message: 'Tool executed', tool: 'test_tool' });
    });
});
