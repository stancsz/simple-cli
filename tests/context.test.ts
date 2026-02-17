import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextManager } from '../src/context/ContextManager.js';
import { join } from 'path';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';

// Mock MCP
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();

const mockMcp = {
    getClient: mockGetClient,
} as any;

describe('ContextManager Integration', () => {
    const testCompany = 'test-company-' + Date.now();
    const originalEnv = process.env.JULES_COMPANY;
    // ContextManager uses process.cwd() so we need to be careful.
    // We will clean up after ourselves.

    const contextFileDir = join(process.cwd(), '.agent', 'companies', testCompany);
    const contextFile = join(contextFileDir, 'context.json');

    beforeEach(async () => {
        process.env.JULES_COMPANY = testCompany;
        vi.resetAllMocks();

        // Mock getClient to return a client with callTool
        mockGetClient.mockReturnValue({
            callTool: mockCallTool
        });

        // Ensure clean slate
        if (existsSync(contextFileDir)) {
             await rm(contextFileDir, { recursive: true, force: true });
        }
    });

    afterEach(async () => {
        process.env.JULES_COMPANY = originalEnv;
        if (existsSync(contextFileDir)) {
            await rm(contextFileDir, { recursive: true, force: true });
        }
    });

    it('should read context from Brain MCP if available', async () => {
        const expectedContext = { goals: ['Goal 1'] };
        mockCallTool.mockResolvedValue({
            content: [{ text: JSON.stringify(expectedContext) }]
        });

        const manager = new ContextManager(mockMcp);
        const context = await manager.readContext();

        expect(mockGetClient).toHaveBeenCalledWith('brain');
        expect(mockCallTool).toHaveBeenCalledWith({
            name: 'brain_get_context',
            arguments: { company: testCompany }
        });
        expect(context.goals).toEqual(['Goal 1']);
    });

    it('should fallback to local file if Brain MCP fails', async () => {
        // Brain fails
        mockCallTool.mockRejectedValue(new Error('Brain down'));

        // Setup local file
        const localContext = { goals: ['Local Goal'] };
        await mkdir(contextFileDir, { recursive: true });
        await writeFile(contextFile, JSON.stringify(localContext));

        const manager = new ContextManager(mockMcp);
        const context = await manager.readContext();

        expect(context.goals).toEqual(['Local Goal']);
    });

    it('should update context to Brain MCP', async () => {
        // Mock read response first (empty)
        mockCallTool.mockResolvedValueOnce({ content: [{ text: '{}' }] });
        // Mock store response
        mockCallTool.mockResolvedValueOnce({ content: [{ text: 'Stored' }] });

        const manager = new ContextManager(mockMcp);
        await manager.updateContext({ goals: ['New Goal'] });

        expect(mockCallTool).toHaveBeenCalledTimes(2);
        // Second call should be brain_store_context
        expect(mockCallTool).toHaveBeenLastCalledWith({
            name: 'brain_store_context',
            arguments: {
                context: expect.stringContaining('"goals":["New Goal"]'),
                company: testCompany
            }
        });
    });

    it('should write to local file as fallback/cache on update', async () => {
        // Mock read response
        mockCallTool.mockResolvedValue({ content: [{ text: '{}' }] });
        // Mock store response (success)
        mockCallTool.mockResolvedValue({ content: [{ text: 'Stored' }] });

        const manager = new ContextManager(mockMcp);
        await manager.updateContext({ goals: ['Cached Goal'] });

        // Check file existence
        expect(existsSync(contextFile)).toBe(true);
        const fileContent = JSON.parse(await import('fs').then(fs => fs.readFileSync(contextFile, 'utf-8')));
        expect(fileContent.goals).toEqual(['Cached Goal']);
    });
});
