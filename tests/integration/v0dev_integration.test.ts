
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { V0DevServer } from '../../src/mcp_servers/v0dev/index.js';
import { V0DevClient } from '../../src/mcp_servers/v0dev/client.js';
import { mockToolHandlers, resetMocks } from './test_helpers/mock_mcp_server.js';

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

// 2. Mock LLM - controls validation response
const mockLLMGenerate = vi.fn();
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: mockLLMGenerate
    })
}));

// 3. Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('v0.dev Integration', () => {
    let server: V0DevServer;

    beforeEach(() => {
        vi.clearAllMocks();
        resetMocks();
        process.env.V0DEV_API_KEY = 'test-api-key';

        // Instantiate server
        server = new V0DevServer();
    });

    afterEach(() => {
        delete process.env.V0DEV_API_KEY;
    });

    it('should generate a UI component successfully', async () => {
        // Mock successful API response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: 'comp-123',
                code: '<div>Hello World</div>',
                language: 'tsx',
                framework: 'react',
                model: 'v0-dev'
            })
        });

        const toolHandler = mockToolHandlers.get('v0dev_generate_component');
        expect(toolHandler).toBeDefined();

        if (!toolHandler) return;

        const result = await toolHandler({ prompt: 'Create a button', framework: 'react' });

        expect(result.content[0].text).toContain('Successfully generated component');
        expect(result.content[0].text).toContain('<div>Hello World</div>');

        // Verify fetch call
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.v0.dev/generate',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-key'
                }),
                body: expect.stringContaining('"prompt":"Create a button"')
            })
        );
    });

    it('should handle API errors gracefully', async () => {
        // Mock API error
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: async () => 'Invalid API Key'
        });

        const toolHandler = mockToolHandlers.get('v0dev_generate_component');
        if (!toolHandler) return;

        const result = await toolHandler({ prompt: 'Create a button' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error generating component');
        expect(result.content[0].text).toContain('Invalid API Key');
    });

    it('should list supported frameworks', async () => {
         const toolHandler = mockToolHandlers.get('v0dev_list_frameworks');
         if (!toolHandler) return;

         const result = await toolHandler({});

         expect(result.content[0].text).toContain('Supported frameworks: react, vue, html');
    });

    it('should validate prompts using LLM', async () => {
        // Mock LLM response for valid prompt
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({ valid: true, reason: "Valid UI request" })
        });

        const toolHandler = mockToolHandlers.get('v0dev_validate_prompt');
        if (!toolHandler) return;

        const result = await toolHandler({ prompt: 'Make a navbar' });

        expect(result.content[0].text).toContain('"valid": true');
        expect(mockLLMGenerate).toHaveBeenCalledWith(
            expect.stringContaining("validation assistant"),
            expect.arrayContaining([{ role: "user", content: "Make a navbar" }])
        );
    });

    it('should handle invalid prompts via LLM', async () => {
        // Mock LLM response for invalid prompt
        mockLLMGenerate.mockResolvedValueOnce({
            message: JSON.stringify({ valid: false, reason: "Not a UI request" })
        });

        const toolHandler = mockToolHandlers.get('v0dev_validate_prompt');
        if (!toolHandler) return;

        const result = await toolHandler({ prompt: 'What is the weather?' });

        expect(result.content[0].text).toContain('"valid": false');
    });

    it('should handle malformed LLM responses', async () => {
         mockLLMGenerate.mockResolvedValueOnce({
            message: "This is not JSON."
        });

        const toolHandler = mockToolHandlers.get('v0dev_validate_prompt');
        if (!toolHandler) return;

        const result = await toolHandler({ prompt: 'Make a navbar' });

        expect(result.content[0].text).toContain('"valid": false');
        expect(result.content[0].text).toContain('Could not parse validation response');
    });
});
