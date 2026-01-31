import { describe, it, expect } from 'vitest';
import { loadTools } from '../src/registry.js';
import { join } from 'path';

describe('Script Skills', () => {
    it('should load a python script tool via json metadata', async () => {
        const tools = await loadTools();
        expect(tools.has('pythonHello')).toBe(true);

        const tool = tools.get('pythonHello')!;
        expect(tool.description).toBe('A test python skill');
        expect(tool.source).toBe('project');
    });

    it('should execute a windows batch script tool', async () => {
        const tools = await loadTools();
        expect(tools.has('winHello')).toBe(true);

        const tool = tools.get('winHello')!;
        const result = (await tool.execute({ name: 'Stan' })) as string;

        expect(result).toContain('Windows Shell says: Hello');
        expect(result).toContain('{"name":"Stan"}');
    });
});
