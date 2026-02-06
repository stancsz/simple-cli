/**
 * Tool: verify_staged
 * Run a command in a verification sandbox against staged changes
 */

import { cp, mkdir, rm, symlink, readdir } from 'fs/promises';
import { resolve, join } from 'path';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getContextManager } from '../context.js';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export const name = 'verify_staged';
export const description = 'Run a verification command (e.g., "npm test") in a sandbox with staged changes applied. DOES NOT modify the actual project.';
export const permission = 'run' as const;

export const schema = z.object({
  command: z.string().describe('The command to run (e.g., "npm test", "npm run lint")'),
});

export const execute = async (args: Record<string, unknown>): Promise<string> => {
  const { command } = schema.parse(args);
  const ctx = getContextManager();
  const cwd = ctx.getCwd();
  const stagingDir = ctx.getStagingDir();
  const sandboxDir = join(cwd, '.simple', 'verification_sandbox');

  if (!existsSync(stagingDir)) {
    return 'No staged changes found (staging directory does not exist).';
  }

  try {
    // 1. Clean up previous sandbox
    await rm(sandboxDir, { recursive: true, force: true });
    await mkdir(sandboxDir, { recursive: true });

    // 2. Copy project files to sandbox (excluding heavy/internal dirs)
    const exclude = ['.git', 'node_modules', '.simple', 'dist', 'coverage', '.env'];

    // Manual copy of top-level items to avoid "copy into self" error
    const items = await readdir(cwd);
    for (const item of items) {
        if (exclude.includes(item)) continue;
        const srcPath = join(cwd, item);
        const destPath = join(sandboxDir, item);

        await cp(srcPath, destPath, {
            recursive: true,
            // Still verify subdirectories just in case
             filter: (source) => {
                const basename = source.split(/[\\/]/).pop();
                return basename ? !exclude.includes(basename) : true;
            }
        });
    }

    // 3. Symlink node_modules if it exists
    const nodeModulesPath = join(cwd, 'node_modules');
    if (existsSync(nodeModulesPath)) {
      try {
          await symlink(nodeModulesPath, join(sandboxDir, 'node_modules'), 'junction');
      } catch (e) {
          // Fallback: try copying if symlink fails? No, too big. Just report warning.
          return `Failed to symlink node_modules: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // 4. Overlay staged changes
    // Force overwrite
    await cp(stagingDir, sandboxDir, { recursive: true, force: true });

    // 5. Run command
    const { stdout, stderr } = await execAsync(command, { cwd: sandboxDir });

    return `Verification Success!\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`;

  } catch (error) {
      if (typeof error === 'object' && error !== null && 'stdout' in error) {
          const e = error as { stdout: string; stderr: string; message: string };
          return `Verification Failed (Command Error):\n${e.message}\n\nStdout:\n${e.stdout}\n\nStderr:\n${e.stderr}`;
      }
      return `Verification Failed (System Error): ${error instanceof Error ? error.message : String(error)}`;
  }
};
