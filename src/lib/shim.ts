/**
 * OpenClaw RPC Shim: allow scripts to call simple-cli tools
 */
import { execSync } from 'child_process';
import { join } from 'path';

/**
 * Invoke a simple-cli tool with arguments
 */
export async function invoke(tool: string, args: Record<string, any> = {}): Promise<any> {
    // Determine path to simple-cli. We assume it's in the same project or installed.
    // In production, we'd use the global 'simple' command.
    const isWindows = process.platform === 'win32';
    const cliCmd = 'simple'; // Or local path to dist/cli.js

    try {
        const cmd = `${cliCmd} --invoke-json "${tool}" "${JSON.stringify(args).replace(/"/g, '\\"')}"`;
        const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
        try {
            return JSON.parse(output.trim());
        } catch {
            return output.trim();
        }
    } catch (error: any) {
        throw new Error(`Tool invocation failed: ${error.stderr || error.message}`);
    }
}

// Global attachment for 'node.invoke' style parity
if (typeof (global as any).invoke === 'undefined') {
    (global as any).invoke = invoke;
}
