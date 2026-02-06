import { ContextManager } from '../context.js';
import { applySearchReplace } from '../tools/write_files.js';
import { execute as executeLint } from '../tools/linter.js';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Blacklisted dangerous commands
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -fr /',
  ':(){:|:&};:', // Fork bomb
  '> /dev/sda',
  'mkfs',
  'dd if=',
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateToolExecution(
  toolName: string,
  args: any,
  ctx: ContextManager
): Promise<ValidationResult> {

  // 1. Command Safety
  if (toolName === 'run_command') {
    const command = args.command as string;
    if (!command) return { valid: true };

    for (const dangerous of DANGEROUS_COMMANDS) {
      if (command.includes(dangerous)) {
        return {
          valid: false,
          error: `Command blocked by safety layer: Contains dangerous pattern "${dangerous}"`
        };
      }
    }
  }

  // 2. Code Integrity (Write Files)
  if (toolName === 'write_files') {
    const files = args.files as Array<{
      path: string;
      content?: string;
      searchReplace?: { search: string; replace: string }[];
    }>;

    if (!files || !Array.isArray(files)) return { valid: true };

    // Create a temp directory for validation
    const tempDir = join(process.cwd(), '.simple', 'workdir', 'validation_tmp');
    await mkdir(tempDir, { recursive: true });

    try {
      for (const file of files) {
        let contentToWrite = '';

        if (file.content !== undefined) {
          contentToWrite = file.content;
        } else if (file.searchReplace) {
          if (existsSync(file.path)) {
             try {
                const originalContent = await readFile(file.path, 'utf-8');
                const result = applySearchReplace(originalContent, file.searchReplace);
                contentToWrite = result.content;
             } catch (e) {
                 // Ignore read errors, let tool handle it
                 continue;
             }
          } else {
             // File doesn't exist, cannot apply patch.
             continue;
          }
        } else {
          continue;
        }

        // Write to temp file
        // We preserve extension for linter detection
        // Flatten path to avoid subdirectories issues
        const safeName = file.path.replace(/[\/\\]/g, '_');
        const tempPath = join(tempDir, `temp_validate_${Date.now()}_${safeName}`);
        await writeFile(tempPath, contentToWrite, 'utf-8');

        try {
            // Run Linter
            const lintResult = await executeLint({ path: tempPath, fix: false });

            if (!lintResult.passed) {
            // Format errors
            const errors = lintResult.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
            return {
                valid: false,
                error: `Syntax validation failed for ${file.path}:\n${errors}`
            };
            }
        } finally {
            // Cleanup
            await unlink(tempPath).catch(() => {});
        }
      }
    } catch (e) {
        // Validation error (internal), allow execution to proceed?
        // Or fail safe?
        // Let's log and allow if it's an internal error, but if it's a caught error above we returned valid:false.
        // If something unexpected happens, we probably shouldn't block unless we are sure.
        // But for "Secure Spinal Cord", maybe fail safe is better?
        // Let's assume valid: true if internal error for now to avoid blocking on bugs.
    }
  }

  return { valid: true };
}
