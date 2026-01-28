/**
 * Tool: runCommand
 * Execute shell commands in a sandboxed environment
 */

import { spawn } from 'child_process';
import { z } from 'zod';

export const name = 'runCommand';

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
  const safeEnv: Record<string, string> = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    TERM: process.env.TERM || 'xterm',
    LANG: process.env.LANG || 'en_US.UTF-8'
  };
  
  // Add any additional env vars (but not secrets)
  if (additionalEnv) {
    for (const [key, value] of Object.entries(additionalEnv)) {
      if (!key.toLowerCase().includes('key') && 
          !key.toLowerCase().includes('secret') &&
          !key.toLowerCase().includes('token') &&
          !key.toLowerCase().includes('password')) {
        safeEnv[key] = value;
      }
    }
  }
  
  return safeEnv;
};

export const execute = async (args: Record<string, unknown>): Promise<CommandResult> => {
  const parsed = schema.parse(args);
  const timeout = parsed.timeout || 30000;
  const env = createSafeEnv(parsed.env);
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    
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
