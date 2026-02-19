
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoltNewServer } from '../../src/mcp_servers/boltnew/index.js';
import { mockToolHandlers, resetMocks } from './test_helpers/mock_mcp_server.js';
// We need to import the mocked fetch to control it in tests
import fetch from 'node-fetch';

// --- Mock Dependencies ---

// 1. Mock McpServer (SDK)
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', async () => {
    const { MockMcpServer } = await import('./test_helpers/mock_mcp_server.js');
    return {
        McpServer: MockMcpServer
    };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class { connect() {} }
}));

// 2. Mock node-fetch
vi.mock('node-fetch', () => {
    return {
        default: vi.fn()
    };
});

describe('Bolt.new Integration', () => {
    let server: BoltNewServer;
    // Cast fetch to a mock function for TypeScript
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        resetMocks();
        process.env.BOLTNEW_API_KEY = 'test-api-key';

        // Instantiate server
        server = new BoltNewServer();
    });

    afterEach(() => {
        delete process.env.BOLTNEW_API_KEY;
    });

    it('should generate a UI component successfully', async () => {
        // Mock successful API response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                code: 'export default function Component() { return <div>Generated Content</div>; }',
                preview_url: 'https://bolt.new/preview/123',
                framework: 'react'
            })
        });

        const toolHandler = mockToolHandlers.get('boltnew_generate');
        expect(toolHandler).toBeDefined();

        if (!toolHandler) return;

        const result = await toolHandler({ description: 'Create a button', framework: 'react' });

        expect(result.content[0].text).toContain('Successfully generated component');
        expect(result.content[0].text).toContain('Generated Content');
        expect(result.content[0].text).toContain('Preview: https://bolt.new/preview/123');

        // Verify fetch call
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.bolt.new/v1/generate',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-key'
                }),
                body: expect.stringContaining('"prompt":"Create a button"')
            })
        );
    });

    it('should fall back to simulation if API call fails', async () => {
        // Mock API error
        mockFetch.mockRejectedValueOnce(new Error('API Unavailable'));

        const toolHandler = mockToolHandlers.get('boltnew_generate');
        if (!toolHandler) return;

        const result = await toolHandler({ description: 'Create a button' });

        // Should NOT be an error now, but a fallback success
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('Successfully generated component');
        expect(result.content[0].text).toContain('(Fallback)');
    });

    it('should list supported frameworks', async () => {
        // Mock API response for list frameworks
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                frameworks: ['react', 'vue', 'svelte', 'html']
            })
        });

         const toolHandler = mockToolHandlers.get('boltnew_list_frameworks');
         if (!toolHandler) return;

         const result = await toolHandler({});

         expect(result.content[0].text).toContain('Supported frameworks: react, vue, svelte, html');

         // Verify fetch call
         expect(mockFetch).toHaveBeenCalledWith(
            'https://api.bolt.new/v1/frameworks',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-key'
                })
            })
         );
    });

    it('should fall back to mocked implementation if no API key is set', async () => {
        delete process.env.BOLTNEW_API_KEY;
        // Re-instantiate server to pick up missing env var
        server = new BoltNewServer();

        const toolHandler = mockToolHandlers.get('boltnew_generate');
        if (!toolHandler) return;

        const result = await toolHandler({ description: 'Create a button', framework: 'vue' });

        expect(result.content[0].text).toContain('Successfully generated component');
        expect(result.content[0].text).toContain('// Generated vue component for: Create a button');
        // Verify fetch was NOT called
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
