import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTool } from '../src/builtins.js';
import * as fs from 'fs';
import * as fsp from 'fs/promises';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
}));

describe('create_tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should error if source file does not exist', async () => {
        (fs.existsSync as any).mockReturnValue(false);
        const result = await createTool.execute({ source_path: 'foo.ts', name: 'foo', description: 'desc', usage: 'usage', scope: 'local' });
        expect(result).toContain('Source file not found');
    });

    it('should error if tool already exists', async () => {
        // Mock source file existence
        (fs.existsSync as any).mockImplementation((path: string) => {
            if (path === 'foo.ts') return true;
            // Matches file path
            if (path.includes('.agent/tools') && path.endsWith('bar.ts')) return true;
            return false;
        });

        // Mock reading source file to avoid crash
        (fsp.readFile as any).mockResolvedValue('content');

        const result = await createTool.execute({ source_path: 'foo.ts', name: 'bar', description: 'desc', usage: 'usage', scope: 'local' });
        expect(result).toContain("Error: Tool 'bar' already exists");
    });

    it('should warn if similar tool exists', async () => {
         (fs.existsSync as any).mockImplementation((path: string) => {
            if (path === 'foo.ts') return true;
            // Matches directory path but NOT file path (assuming file check appends filename)
            // But directory check uses just targetDir.
            // targetDir ends with 'tools'.
            if (path.endsWith('tools')) return true;
            return false;
        });

        // Mock readdir to return similar file
        (fsp.readdir as any).mockResolvedValue(['bar_v1.ts']);

        // Spy on console.warn
        const warnSpy = vi.spyOn(console, 'warn');

        (fsp.readFile as any).mockResolvedValue('content');

        await createTool.execute({ source_path: 'foo.ts', name: 'bar', description: 'desc', usage: 'usage', scope: 'local' });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning: A similar tool 'bar_v1.ts' already exists."));
    });
});
