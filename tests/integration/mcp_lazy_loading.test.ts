import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPManager } from '../../src/mcp_manager.js';

// Mock the SDK Client and Transports
const mockConnect = vi.fn();
const mockCallTool = vi.fn();
const mockClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: class MockClient {
            constructor() {}
            async connect(transport: any) {
                await mockConnect(transport);
            }
            async listTools() {
                return { tools: [] };
            }
            async callTool(req: any) {
                return mockCallTool(req);
            }
            async close() {
                await mockClose();
            }
        }
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class {} }));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class {} }));

class TestMCPManager extends MCPManager {
    public getDiscoveredServers() { return this.discoveredServers; }
    public getClients() { return this.clients; }
}

describe('MCP Lazy Loading', () => {
    let manager: TestMCPManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockConnect.mockResolvedValue(undefined);
        mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] });
        mockClose.mockResolvedValue(undefined);

        manager = new TestMCPManager();
        manager.getDiscoveredServers().set('brain', {
            name: 'brain',
            command: 'echo',
            args: [],
            env: {},
            source: 'config',
            warmup: false
        });
    });

    it('should register tools for stopped servers from static registry', async () => {
        const tools = await manager.getTools();
        const brainStore = tools.find(t => t.name === 'brain_store');

        expect(brainStore).toBeDefined();
        expect(manager.isServerRunning('brain')).toBe(false);
    });

    it('should start server on demand when tool is executed', async () => {
        const tools = await manager.getTools();
        const brainStore = tools.find(t => t.name === 'brain_store');

        await brainStore?.execute({ taskId: '1' });

        expect(mockConnect).toHaveBeenCalled();
        expect(manager.isServerRunning('brain')).toBe(true);
    });

    it('should handle concurrent server starts correctly', async () => {
        // Add delay to connect to simulate race
        mockConnect.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
        });

        const tools = await manager.getTools();
        const brainStore = tools.find(t => t.name === 'brain_store');

        // Execute twice concurrently
        await Promise.all([
            brainStore?.execute({ taskId: '1' }),
            brainStore?.execute({ taskId: '2' })
        ]);

        // Should have connected ONLY ONCE
        expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should retry tool execution on failure', async () => {
        // First call fails
        mockCallTool.mockRejectedValueOnce(new Error("Connection lost"));
        // Second call (retry) succeeds
        mockCallTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Retry Success' }] });

        const tools = await manager.getTools();
        const brainStore = tools.find(t => t.name === 'brain_store');

        mockConnect.mockResolvedValue(undefined);

        const res: any = await brainStore?.execute({ taskId: '1' });

        expect(res.content[0].text).toBe('Retry Success');

        // Should have called startServer (connect) twice: initial + retry restart
        expect(mockConnect).toHaveBeenCalledTimes(2);
        // Should have called close once
        expect(mockClose).toHaveBeenCalledTimes(1);
    });
});
