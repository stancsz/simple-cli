import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompanyContextMemory } from '../src/brain/company_context.js';
import * as lancedb from '@lancedb/lancedb';

// Spy on lancedb
const mockAdd = vi.fn();
const mockSearch = vi.fn();
const mockLimit = vi.fn();
const mockToArray = vi.fn();

vi.mock('@lancedb/lancedb', () => ({
    connect: vi.fn().mockResolvedValue({
        tableNames: vi.fn().mockResolvedValue(['company_context_acme']), // Simulate existing table
        createTable: vi.fn().mockImplementation(() => ({
            add: mockAdd,
        })),
        openTable: vi.fn().mockImplementation(() => ({
            add: mockAdd,
            search: mockSearch,
            limit: mockLimit,
            toArray: mockToArray,
        })),
    })
}));

vi.mock('../src/llm.js', () => ({
    createLLM: vi.fn().mockReturnValue({
        embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    })
}));

describe('CompanyContextMemory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearch.mockReturnThis();
        mockLimit.mockReturnThis();
        mockToArray.mockResolvedValue([]);
    });

    it('should store context correctly', async () => {
        const memory = new CompanyContextMemory();
        await memory.store('acme', 'important policy', { author: 'admin' });

        expect(lancedb.connect).toHaveBeenCalled();
        // It should open existing table or create new one.
        // We mocked tableNames to include it, so openTable should be called.
        // Wait, 'company_context_acme' vs defaultTableName.
        // In implementation: tableName = `company_context_acme` (sanitized)
        // tableNames includes it, so openTable called.

        expect(mockAdd).toHaveBeenCalledWith([expect.objectContaining({
            company: 'acme',
            text: 'important policy',
            metadata: JSON.stringify({ author: 'admin' })
        })]);
    });

    it('should query context and return results', async () => {
        const memory = new CompanyContextMemory();

        const mockResult = [{
            text: 'policy result',
            metadata: JSON.stringify({ source: 'doc1' }),
            company: 'acme',
            vector: [],
            id: '1',
            timestamp: 123
        }];
        mockToArray.mockResolvedValue(mockResult);

        const results = await memory.query('acme', 'policy');

        expect(results).toHaveLength(1);
        expect(results[0].text).toBe('policy result');
        expect(JSON.parse(results[0].metadata)).toEqual({ source: 'doc1' });
    });
});

import { ContextManager } from '../src/context/manager.js';
import { MCP } from '../src/mcp.js';

// Mock MCP
vi.mock('../src/mcp.js', () => ({
    MCP: vi.fn().mockImplementation(() => ({
        getClient: vi.fn((name) => {
            if (name === 'context_server') {
                return {
                    callTool: vi.fn().mockResolvedValue({
                        content: [{ text: JSON.stringify({ goals: ['goal1'], company_context: 'static context' }) }]
                    })
                };
            }
            if (name === 'brain') {
                return {
                    callTool: vi.fn().mockResolvedValue({
                        content: [{ text: 'relevant rag context' }]
                    })
                };
            }
            return null;
        })
    }))
}));

describe('ContextManager', () => {
    it('should combine static and dynamic context', async () => {
        const manager = new ContextManager();
        const mcp = new MCP();

        const context = await manager.getContext(mcp, 'acme', 'query');

        expect(context).toContain('## Goals\n- goal1');
        expect(context).toContain('## Client Context (Static)\nstatic context');
        expect(context).toContain('## Client Context (Relevant)\nrelevant rag context');
    });
});
