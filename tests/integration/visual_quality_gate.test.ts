import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Supervisor } from '../../src/supervisor.js';
import { MCP } from '../../src/mcp.js';
import { LLM } from '../../src/llm.js';

// Mock dependencies
vi.mock('../../src/llm.js');
vi.mock('../../src/mcp.js');
vi.mock('fs/promises', () => ({
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async () => Buffer.from('fake-image')),
    appendFile: vi.fn(async () => {}),
    unlink: vi.fn(async () => {}),
}));
vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
}));
vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid'),
}));

describe('Visual Quality Gate Integration', () => {
    let supervisor: Supervisor;
    let mockLLM: any;
    let mockMCP: any;
    let mockGateClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        // Setup LLM mock
        mockLLM = {
            generate: vi.fn().mockResolvedValue({
                thought: 'Standard verification passed.',
                message: 'LGTM',
            }),
        };

        // Setup MCP Client mock for visual_quality_gate
        mockGateClient = {
            callTool: vi.fn(),
        };

        // Setup MCP mock
        mockMCP = {
            getClient: vi.fn().mockImplementation((name) => {
                if (name === 'visual_quality_gate') return mockGateClient;
                return null;
            }),
        };

        supervisor = new Supervisor(mockLLM as unknown as LLM, mockMCP as unknown as MCP);
    });

    it('should NOT trigger quality gate for non-visual tasks', async () => {
        const result = { content: [{ type: 'text', text: 'some code' }] };
        const verifyResult = await supervisor.verify(result, 'write_file', {}, 'create a file', []);

        expect(mockGateClient.callTool).not.toHaveBeenCalled();
        expect(verifyResult.verified).toBe(true);
    });

    it('should trigger quality gate for take_screenshot tool', async () => {
        const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        // Mock passing score
        mockGateClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ score: 85, critique: [], reasoning: 'Good job' }) }]
        });

        const verifyResult = await supervisor.verify(
            result,
            'take_screenshot',
            {},
            'design a landing page',
            []
        );

        expect(mockGateClient.callTool).toHaveBeenCalledWith({
            name: 'assess_design_quality',
            arguments: expect.objectContaining({
                screenshot_path: expect.stringMatching(/.*\.png$/),
                context: 'design a landing page'
            })
        });
        expect(verifyResult.verified).toBe(true);
    });

    it('should trigger quality gate if user request contains visual keywords', async () => {
        const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        mockGateClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ score: 80, critique: [], reasoning: 'Good' }) }]
        });

        await supervisor.verify(
            result,
            'some_tool',
            {},
            'check the css style',
            []
        );

        expect(mockGateClient.callTool).toHaveBeenCalled();
    });

    it('should fail verification if score is < 70', async () => {
        const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        // Mock failing score
        mockGateClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({
                score: 50,
                critique: ['Bad colors', 'Small font'],
                reasoning: 'Ugly'
            }) }]
        });

        const verifyResult = await supervisor.verify(
            result,
            'take_screenshot',
            {},
            'design check',
            []
        );

        expect(verifyResult.verified).toBe(false);
        expect(verifyResult.feedback).toContain('Visual Quality Gate Failed');
        expect(verifyResult.feedback).toContain('Bad colors');
    });

    it('should pass company_id to the quality gate', async () => {
        const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        mockGateClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ score: 90, critique: [], reasoning: 'Excellent' }) }]
        });

        await supervisor.verify(
            result,
            'take_screenshot',
            {},
            'design check',
            [],
            undefined,
            'acme-corp' // Company ID
        );

        expect(mockGateClient.callTool).toHaveBeenCalledWith({
            name: 'assess_design_quality',
            arguments: expect.objectContaining({
                company_id: 'acme-corp'
            })
        });
    });

    it('should fallback to pass if quality gate server fails', async () => {
         const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        // Mock error
        mockGateClient.callTool.mockRejectedValue(new Error('Server offline'));

        const verifyResult = await supervisor.verify(
            result,
            'take_screenshot',
            {},
            'design check',
            []
        );

        // Should proceed to LLM verification which we mocked to pass
        expect(verifyResult.verified).toBe(true);
    });

    it('should extract HTML content from history for take_screenshot tool', async () => {
        const result = {
            content: [{
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png'
            }]
        };

        mockGateClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ score: 85, critique: [], reasoning: 'Good job' }) }]
        });

        const history = [
            { role: 'user', content: 'create index.html' },
            { role: 'assistant', content: JSON.stringify({ tool: 'write_file', args: { path: 'index.html', content: '<html></html>' } }) }
        ];

        await supervisor.verify(
            result,
            'take_screenshot',
            {},
            'design a landing page',
            history as any
        );

        expect(mockGateClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            arguments: expect.objectContaining({
                html_content: '<html></html>'
            })
        }));
    });
});
