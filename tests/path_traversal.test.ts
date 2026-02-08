
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFiles, writeFiles, deleteFile, listFiles, listDir, searchFiles } from '../src/builtins.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

describe('Path Traversal Security', () => {
    let tempDir: string;
    let outsideFile: string;

    beforeEach(async () => {
        // Create a temp dir outside of the workspace (which is process.cwd())
        // But process.cwd() is the repo root.
        // So any path in /tmp is outside.
        // Note: mkdir returns string | undefined
        const p = join(tmpdir(), `test-security-${Date.now()}`);
        await mkdir(p, { recursive: true });
        tempDir = p;
        outsideFile = join(tempDir, 'secret.txt');
        await writeFile(outsideFile, 'SECRET_DATA');
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('readFiles should block access to outside files', async () => {
        const result = await readFiles.execute({ paths: [outsideFile] });
        const fileRes = result.find((r: any) => r.path === outsideFile);
        expect(fileRes).toBeDefined();
        expect(fileRes.error).toBeDefined();
        expect(fileRes.error).toContain('Access denied');
        expect(fileRes.content).toBeUndefined();
    });

    it('writeFiles should block writing to outside files', async () => {
        const target = join(tempDir, 'hacked.txt');
        const result = await writeFiles.execute({ files: [{ path: target, content: 'hacked' }] });
        const res = Array.isArray(result) ? result[0] : result;
        expect(res.success).toBe(false);
        expect(res.message).toContain('Access denied');
        expect(existsSync(target)).toBe(false);
    });

    it('deleteFile should block deleting outside files', async () => {
        const result = await deleteFile.execute({ path: outsideFile });
        expect(result).toContain('Access denied');
        expect(existsSync(outsideFile)).toBe(true);
    });

    it('listFiles should block listing outside directories', async () => {
        const result = await listFiles.execute({ pattern: '*', path: tempDir, ignore: [], includeDirectories: false });
        expect(result.error).toContain('Access denied');
        expect(result.matches).toHaveLength(0);
    });

    it('listDir should block listing outside directories', async () => {
        const result = await listDir.execute({ path: tempDir });
        expect(result).toContain('Access denied');
    });

    it('searchFiles should block searching in outside files', async () => {
        const result = await searchFiles.execute({ pattern: 'SECRET', path: outsideFile, glob: '*', ignoreCase: false, contextLines: 0, filesOnly: false });
        expect(result.error).toContain('Access denied');
    });

});
