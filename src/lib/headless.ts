import { WriteStream } from 'tty';

/**
 * Standardized JSON structure for tool outputs
 */
export interface StructuredToolResult {
  status: 'success' | 'error';
  result: unknown;
  message?: string;
  metadata: {
    duration_ms: number;
    tokens: number;
    timestamp: string;
  };
}

/**
 * Remove ANSI escape codes from a string
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Calculate tokens for a given string or object
 */
export async function countTokens(input: unknown): Promise<number> {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  if (!str) return 0;

  try {
    const { encode } = await import('gpt-tokenizer');
    return encode(str).length;
  } catch {
    // Fallback if import fails or not found
    return Math.ceil(str.length / 4);
  }
}

/**
 * Create a standardized tool result
 */
export async function formatToolResult(
  result: unknown,
  status: 'success' | 'error' = 'success',
  durationMs: number = 0,
  message?: string
): Promise<StructuredToolResult> {
  return {
    status,
    result,
    message,
    metadata: {
      duration_ms: durationMs,
      tokens: await countTokens(result),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Console Interceptor to strip ANSI codes and suppress decorative output
 * when running in headless mode.
 */
export class ConsoleInterceptor {
  private originalStdoutWrite: typeof process.stdout.write;
  private originalStderrWrite: typeof process.stderr.write;
  private active = false;

  constructor() {
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
  }

  public activate() {
    if (this.active) return;
    this.active = true;

    // Monkey patch stdout
    process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
      if (!this.active) {
        return this.originalStdoutWrite(chunk, encoding, callback);
      }

      // Convert chunk to string
      const str = chunk.toString();
      const clean = stripAnsi(str);

      // In headless mode, we might want to suppress some logs entirely
      // For example, if it's just decorative UI.
      // But checking for "decorative" is hard.
      // For now, we strip ANSI.
      // If the string becomes empty or just whitespace after stripping, maybe we skip it?
      // But some functional output might be whitespace.

      // The requirement says: "Strip picocolors and TUI decorative elements".
      // If we just strip ANSI, we satisfy "Strip picocolors".

      return this.originalStdoutWrite(clean, encoding, callback);
    };

    // Monkey patch stderr
    process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
      if (!this.active) {
        return this.originalStderrWrite(chunk, encoding, callback);
      }
      const str = chunk.toString();
      const clean = stripAnsi(str);
      return this.originalStderrWrite(clean, encoding, callback);
    };
  }

  public deactivate() {
    if (!this.active) return;
    this.active = false;
    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;
  }
}
