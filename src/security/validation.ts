import { ContextManager } from '../context.js';
import { resolve, relative, isAbsolute } from 'path';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates tool execution requests for security and safety.
 * Intercepts potentially destructive operations before they run.
 */
export function validateToolExecution(toolName: string, args: Record<string, unknown>, ctx: ContextManager): ValidationResult {
  const cwd = ctx.getCwd();

  // 1. Command Safety Checks
  if (toolName === 'run_command' && args.command && typeof args.command === 'string') {
    const cmd = args.command;

    // Block obviously destructive commands
    // regex checks for rm -rf / and variations, including typical root variations
    if (/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+|\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+)(\/|.*\/$)/.test(cmd)) {
        // Special case for root or near-root deletion
        // We match rm -rf / or rm -rf /something/.. (roughly)
        // This is a heuristic.
       return { valid: false, message: 'Security Alert: Destructive command detected (rm -rf / or similar). Operation blocked.' };
    }

    // Explicitly block rm -rf / variants
    if (cmd.includes('rm -rf /') || cmd.includes('rm -fr /') || cmd.includes('rm -r /') || cmd.includes('rm -f -r /')) {
         return { valid: false, message: 'Security Alert: Destructive command detected (rm -rf /). Operation blocked.' };
    }

    // Block mkfs
    if (/\bmkfs/.test(cmd)) {
        return { valid: false, message: 'Security Alert: Filesystem creation detected (mkfs). Operation blocked.' };
    }

    // Block dd to raw devices
    if (/\bdd\b.*of=\/dev\//.test(cmd)) {
        return { valid: false, message: 'Security Alert: Direct device access detected (dd). Operation blocked.' };
    }

    // Block fork bombs
    if (/:(\(\)|\s)\s*\{\s*:\|\:&?\s*\};:/.test(cmd)) {
         return { valid: false, message: 'Security Alert: Fork bomb detected. Operation blocked.' };
    }
  }

  // 2. File Operation Safety Checks
  const fileTools = ['write_files', 'write_to_file', 'delete_file'];

  if (fileTools.includes(toolName)) {
      // Normalize args to find file paths
      let paths: string[] = [];

      if (toolName === 'write_files' && Array.isArray(args.files)) {
          paths = args.files.map((f: any) => f.path).filter(p => typeof p === 'string');
      } else if ((toolName === 'write_to_file' || toolName === 'delete_file') && typeof args.path === 'string') {
          paths = [args.path];
      }

      for (const p of paths) {
          const resolved = resolve(cwd, p);
          const rel = relative(cwd, resolved);

          // Check for path traversal out of workspace
          // strict check: relative path must not start with .. and must not be absolute
          if (rel.startsWith('..') || isAbsolute(rel)) {
              return { valid: false, message: `Security Alert: Access denied. Path '${p}' is outside the workspace.` };
          }

          // Check for sensitive files
          if (rel === '.env' || rel.includes('/.env') || rel.endsWith('.env')) {
               return { valid: false, message: `Security Alert: Modification of .env files is restricted.` };
          }

          if (rel.startsWith('.git/') || rel === '.git' || rel.includes('/.git/')) {
               return { valid: false, message: `Security Alert: Direct modification of .git directory is restricted.` };
          }

          if (rel.startsWith('.simple/security') || rel.includes('/.simple/security')) {
              return { valid: false, message: `Security Alert: Modification of security configuration is restricted.` };
          }
      }
  }

  return { valid: true };
}
