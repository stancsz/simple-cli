import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockToolHandlers, resetMocks, MockMcpServer } from './test_helpers/mock_mcp_server.js';

// Mock dependencies BEFORE importing the module under test
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
    return {
        McpServer: MockMcpServer
    };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class { connect() {} }
}));

vi.mock('node-fetch', () => ({
    default: vi.fn()
}));

// Import the server class AFTER mocking
import { DifyServer } from '../../src/mcp_servers/dify/index.js';
import fetch from 'node-fetch';

describe('Dify MCP Server Integration', () => {
    let server: DifyServer;
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        resetMocks();
        process.env.DIFY_API_URL = 'http://test-dify/v1';
        process.env.DIFY_API_KEY = 'test-key';

        // Instantiate server which registers tools
        server = new DifyServer();
    });

    afterEach(() => {
        delete process.env.DIFY_API_URL;
        delete process.env.DIFY_API_KEY;
    });

    it('should deploy a workflow successfully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'app-123', name: 'Test App' })
        });

        const toolHandler = mockToolHandlers.get('deploy_workflow');
        expect(toolHandler).toBeDefined();
        if (!toolHandler) return;

        const config = JSON.stringify({ app: { name: 'Test App' } });
        const result = await toolHandler({ config, name: 'My App' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('Workflow deployed successfully');
        expect(result.content[0].text).toContain('ID: app-123');

        expect(mockFetch).toHaveBeenCalledWith(
            'http://test-dify/v1/apps',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json'
                }),
                body: expect.stringContaining('"name":"My App"')
            })
        );
    });

    it('should trigger an agent successfully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ answer: 'Hello there!' })
        });

        const toolHandler = mockToolHandlers.get('trigger_agent');
        expect(toolHandler).toBeDefined();
        if (!toolHandler) return;

        const result = await toolHandler({ query: 'Hello', inputs: '{}' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('Hello there!');

        expect(mockFetch).toHaveBeenCalledWith(
            'http://test-dify/v1/chat-messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-key'
                }),
                body: expect.stringContaining('"query":"Hello"')
            })
        );
    });

    it('should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Something went wrong'
        });

        const toolHandler = mockToolHandlers.get('trigger_agent');
        if (!toolHandler) return;

        const result = await toolHandler({ query: 'Boom' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to trigger agent: 500 Internal Server Error');
        expect(result.content[0].text).toContain('Something went wrong');
    });

    it('should get conversation history', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ id: 'msg-1', query: 'hi', answer: 'hello' }] })
        });

        const toolHandler = mockToolHandlers.get('get_conversation');
        expect(toolHandler).toBeDefined();
        if (!toolHandler) return;

        const result = await toolHandler({ conversation_id: 'conv-1' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('"id": "msg-1"');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/messages?conversation_id=conv-1'),
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-key'
                })
            })
        );
    });
});
