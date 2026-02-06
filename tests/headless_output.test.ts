import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CLI_PATH = join(process.cwd(), 'src/cli.ts');

describe('Headless Output', () => {
  it('should output standardized JSON in headless mode', async () => {
    // Using npx tsx to run the CLI
    // We invoke list_dir on "src" to get some content
    const command = `npx tsx ${CLI_PATH} --headless --invoke list_dir '{"path": "src"}'`;

    try {
      const { stdout } = await execAsync(command, {
        env: { ...process.env, CI: 'true', NON_INTERACTIVE: 'true' }
      });

      // The output should be pure JSON
      const json = JSON.parse(stdout.trim());

      // Check structure
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('result'); // The actual tool output
      expect(json).toHaveProperty('metadata');

      // Check metadata
      expect(json.metadata).toHaveProperty('duration_ms');
      expect(json.metadata).toHaveProperty('tokens');
      expect(typeof json.metadata.duration_ms).toBe('number');
      expect(typeof json.metadata.tokens).toBe('number');

      // Check result content
      // list_dir returns array of objects { name, isDir }
      const hasCli = Array.isArray(json.result) && json.result.some((e: any) => e.name === 'cli.ts');
      expect(hasCli).toBe(true);

      // Ensure no ANSI codes in the entire output (captured stdout)
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
      expect(stdout).not.toMatch(ansiRegex);

    } catch (error: any) {
       // If JSON.parse fails, it means the output was not structured JSON or had extra text
       // This is expected to fail initially
       if (error instanceof SyntaxError) {
         throw new Error(`Output is not valid JSON: ${error.message}\nOutput preview: ${error.message}`);
       }
       // If exec fails
       if (error.cmd) {
           // We might fail here if the command exits with non-zero, or if assertions fail.
           // If assertions fail inside the try block, verify they bubble up?
           // No, assert failures will throw inside try.
           // So catching 'any' might catch assertion errors too.
           throw error;
       }
       throw error;
    }
  }, 20000);
});
