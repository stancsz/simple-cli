import { describe, it, expect } from 'vitest';
import { loadTools } from '../src/registry.js';
import { join } from 'path';

describe('Advanced Discovery', () => {
    it('should find a python tool with internal docstrings', async () => {
        const tools = await loadTools();
        expect(tools.has('pythonInternal')).toBe(true);
        const tool = tools.get('pythonInternal')!;
        expect(tool.description).toContain('internal documentation');
    });
});
