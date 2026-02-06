import { ContextManager } from '../context.js';
import path from 'path';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const DESTRUCTIVE_PATTERNS = [
  /rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*)\s+[\/\*]/, // rm -rf / or rm -rf *
  /rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*)\s+~/,      // rm -rf ~
  /:(){ :|:& };:/,         // fork bomb
  /mkfs/,
  />\s*\/dev\/sd[a-z]/,    // overwriting devices
  /dd\s+if=/,
  /chmod\s+-R\s+777\s+\//, // chmod -R 777 /
  /wget\s+.*\|\s*sh/,      // piping wget to sh
  /curl\s+.*\|\s*sh/,      // piping curl to sh
];

const SENSITIVE_FILES = [
  '.env',
  '.git',
  '.ssh',
  'id_rsa',
  'id_ed25519',
  '.bashrc',
  '.zshrc',
  '.profile',
  '/etc/passwd',
  '/etc/shadow'
];

export async function validateCommand(
  toolName: string,
  args: any,
  ctx: ContextManager
): Promise<ValidationResult> {
  // 1. Validate Shell Commands
  if (toolName === 'run_command' || toolName === 'terminal') {
    const command = args.command as string;
    if (command) {
        for (const pattern of DESTRUCTIVE_PATTERNS) {
            if (pattern.test(command)) {
                return { valid: false, message: `Command blocked: Potential destructive pattern detected: ${pattern}` };
            }
        }
    }
  }

  // 2. Validate File Operations (Confinement)
  const fileTools = ['write_file', 'write_files', 'write_to_file', 'delete_file', 'read_file', 'read_files', 'move_file', 'copy_file'];

  if (fileTools.includes(toolName)) {
      const pathsToCheck: string[] = [];

      // Extract paths based on tool schema
      if (toolName === 'write_files' && Array.isArray(args.files)) {
          args.files.forEach((f: any) => {
              if (f.path) pathsToCheck.push(f.path);
          });
      } else if (toolName === 'read_files' && Array.isArray(args.paths)) {
          args.paths.forEach((p: string) => pathsToCheck.push(p));
      } else if (toolName === 'move_file') {
          if (args.source) pathsToCheck.push(args.source);
          if (args.destination) pathsToCheck.push(args.destination);
      } else {
          // Single path tools
          const p = args.path || args.filepath;
          if (typeof p === 'string') {
              pathsToCheck.push(p);
          }
      }

      const cwd = ctx.getCwd();

      for (const filePath of pathsToCheck) {
          const resolvedPath = path.resolve(cwd, filePath);
          const relative = path.relative(cwd, resolvedPath);

          // Check confinement
          // If relative starts with .. it means it is outside of cwd
          if (relative.startsWith('..') || (path.isAbsolute(relative) && !resolvedPath.startsWith(cwd))) {
             return { valid: false, message: `Access denied: Path '${filePath}' is outside the working directory.` };
          }

          // Check for sensitive files
          for (const sensitive of SENSITIVE_FILES) {
              if (sensitive === '.git') {
                 if (resolvedPath.includes('/.git/') || resolvedPath.endsWith('/.git') || resolvedPath === '.git') {
                      if (toolName !== 'git') {
                           return { valid: false, message: `Access denied: Direct modification of .git directory is restricted.` };
                      }
                 }
              } else {
                  if (resolvedPath.includes(sensitive)) {
                      return { valid: false, message: `Access denied: Sensitive file access detected (${sensitive}).` };
                  }
              }
          }
      }
  }

  return { valid: true };
}
