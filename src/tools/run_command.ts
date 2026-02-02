/**
 * Tool: runCommand
 * Execute shell commands in a sandboxed environment
 */

import { spawn } from 'child_process';
import { z } from 'zod';

export const name = 'run_command';

export const description = 'Execute a shell command with timeout and environment restrictions';

export const permission = 'execute' as const;

export const schema = z.object({
  command: z.string().describe('The shell command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  env: z.record(z.string()).optional().describe('Additional environment variables')
});

type RunCommandArgs = z.infer<typeof schema>;

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// Restricted environment - remove sensitive variables
const createSafeEnv = (additionalEnv?: Record<string, string>): Record<string, string> => {
  // Start from a minimal safe copy to avoid leaking secrets
  const rawEnv = { ...process.env } as Record<string, string>;

  const sensitivePattern = /(API_KEY$|_KEY$|TOKEN|SECRET|PASSWORD|VLM_API|OPENAI_API|GEMINI_API|NPM_ACCESS_TOKEN)/i;

  const env: Record<string, string> = {};

  for (const [k, v] of Object.entries(rawEnv)) {
    if (!k) continue;
    if (sensitivePattern.test(k)) continue; // skip sensitive keys
    env[k] = v;
  }

  // Add any additional env vars provided explicitly, but still filter them
  if (additionalEnv) {
    for (const [k, v] of Object.entries(additionalEnv)) {
      if (!k) continue;
      if (sensitivePattern.test(k)) continue; // never allow sensitive keys
      env[k] = v;
    }
  }

  return env;
};

export const execute = async (args: Record<string, unknown>): Promise<CommandResult> => {
  const parsed = schema.parse(args);
  const timeout = parsed.timeout || 30000;
  const env = createSafeEnv(parsed.env);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Quick heuristic: detect obviously unbalanced quotes and treat as syntax error
    const singleQuotes = (parsed.command.match(/'/g) || []).length;
    const doubleQuotes = (parsed.command.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
      return resolve({ exitCode: 1, stdout: '', stderr: 'Invalid shell syntax (unbalanced quotes)', timedOut: false });
    }

    const child = spawn(parsed.command, {
      shell: true,
      cwd: parsed.cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      // Limit output size
      if (stdout.length > 100000) {
        stdout = stdout.slice(0, 100000) + '\n... (output truncated)';
        child.kill('SIGTERM');
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 50000) {
        stderr = stderr.slice(0, 50000) + '\n... (output truncated)';
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // If command failed but provided no stderr, include the command for diagnostics
      if ((code ?? 0) !== 0 && !stderr) {
        stderr = `Command failed: ${parsed.command}`;
      }
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        timedOut: false
      });
    });
  });
};
