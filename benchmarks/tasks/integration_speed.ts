
import { integrate_framework } from '../../src/mcp_servers/framework_analyzer/tools.js';
import { rmdir, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function runIntegrationBenchmark() {
    const timestamp = Date.now();
    const frameworkName = `benchmark_framework_${timestamp}`;
    const helpText = `
Usage: dummy-tool [options] <command>

Options:
  -v, --version   Show version
  -h, --help      Show help

Commands:
  hello           Prints hello world
  add <x> <y>     Adds two numbers
  echo <text>     Echoes back text
`;

    // Write dummy help to a file to simulate a CLI source or just pass it directly if function supports it?
    // analyze_framework_source takes 'cli', 'sdk', 'gui'.
    // If 'cli', it runs the command. I don't have the command installed.
    // If 'sdk', it reads a file. I can create a dummy SDK file.

    const dummySdkPath = join(process.cwd(), `dummy_sdk_${timestamp}.txt`);
    await import('fs/promises').then(fs => fs.writeFile(dummySdkPath, helpText));

    console.log(`Starting Integration Benchmark for ${frameworkName}...`);
    const start = Date.now();

    let result;
    try {
        // Use 'sdk' source type so we can pass a file path with the help text
        result = await integrate_framework(frameworkName, 'sdk', dummySdkPath);
    } catch (e) {
        result = { error: (e as Error).message };
    }

    const duration = Date.now() - start;

    // Cleanup
    try {
        if (existsSync(dummySdkPath)) await unlink(dummySdkPath);

        const serverDir = join(process.cwd(), "src", "mcp_servers", frameworkName);
        if (existsSync(serverDir)) {
            await rmdir(serverDir, { recursive: true });
        }

        // Cleanup mcp.staging.json entry
        const stagingPath = join(process.cwd(), "mcp.staging.json");
        if (existsSync(stagingPath)) {
            const content = await readFile(stagingPath, "utf-8");
            const config = JSON.parse(content);
            if (config.mcpServers && config.mcpServers[frameworkName]) {
                delete config.mcpServers[frameworkName];
                await import('fs/promises').then(fs => fs.writeFile(stagingPath, JSON.stringify(config, null, 2)));
            }
        }
    } catch (cleanupError) {
        console.error("Cleanup failed:", cleanupError);
    }

    return {
        task: "integration_speed",
        framework: "Simple-CLI", // We are benchmarking Simple-CLI itself here
        duration_ms: duration,
        success: !result.error,
        details: result.error ? result.error : "Integration successful",
        // Tokens are hard to track without hooking into LLM, so we estimate or leave 0 for now
        tokens: 0
    };
}
