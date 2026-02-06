/**
 * Tool: commit_staged
 * Promote staged changes to the main file system
 */

import { cp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { z } from 'zod';
import { getContextManager } from '../context.js';

export const name = 'commit_staged';
export const description = 'Promote verified changes from the staging directory to the main file system.';
export const permission = 'write' as const;

export const schema = z.object({});

export const execute = async (_args: Record<string, unknown>): Promise<string> => {
    const ctx = getContextManager();
    const stagingDir = ctx.getStagingDir();
    const cwd = ctx.getCwd();

    if (!existsSync(stagingDir)) {
        return 'No staged changes found to commit.';
    }

    try {
        // Copy staged files to cwd, overwriting existing files
        await cp(stagingDir, cwd, { recursive: true, force: true });

        // Clean up staging directory
        await rm(stagingDir, { recursive: true, force: true });

        return 'Successfully committed staged changes to the main file system.';
    } catch (error) {
        throw new Error(`Failed to commit staged changes: ${error instanceof Error ? error.message : String(error)}`);
    }
};
