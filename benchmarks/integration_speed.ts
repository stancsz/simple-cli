import { integrate_framework } from '../src/mcp_servers/framework_analyzer/tools.js';
import { setLLMFactory } from '../src/llm.js';
import { MockLLM } from './mocks/llm.js';
import { rmdir, unlink, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// Inject Mock LLM
setLLMFactory((configs) => new MockLLM(configs));

const FRAMEWORKS = [
    { name: "roo_code_bench", label: "Roo Code" },
    { name: "swe_agent_bench", label: "SWE-agent" },
    { name: "aider_bench", label: "Aider" }
];

export async function runIntegrationBenchmark() {
    console.log("Starting Integration Speed Benchmark...");
    const results = [];

    for (const fw of FRAMEWORKS) {
        const dummySdkPath = join(process.cwd(), `temp_sdk_${fw.name}.txt`);
        const serverDir = join(process.cwd(), "src", "mcp_servers", fw.name);

        try {
            // 1. Create dummy SDK file
            const dummyContent = `
            /**
             * ${fw.label} SDK Definition
             * This is a mock definition for benchmarking purposes.
             */
            export function run(command: string): void;
            `;
            await writeFile(dummySdkPath, dummyContent);

            // 2. Measure Integration Time
            console.log(`Integrating ${fw.label}...`);
            const start = Date.now();

            const result = await integrate_framework(fw.name, 'sdk', dummySdkPath);

            const end = Date.now();
            const duration = end - start;

            if (result.error) {
                console.error(`Failed to integrate ${fw.label}:`, result.error);
                results.push({
                    framework: fw.label,
                    integration_time_ms: null,
                    status: "failed",
                    error: result.error
                });
            } else {
                console.log(`Integration successful for ${fw.label} in ${duration}ms`);
                results.push({
                    framework: fw.label,
                    integration_time_ms: duration,
                    status: "success",
                    scaffold_path: result.scaffold_path
                });
            }

        } catch (error: any) {
            console.error(`Error benchmarking ${fw.label}:`, error);
             results.push({
                framework: fw.label,
                integration_time_ms: null,
                status: "error",
                error: error.message
            });
        } finally {
            // 3. Cleanup
            if (existsSync(dummySdkPath)) await unlink(dummySdkPath);

            if (existsSync(serverDir)) {
                await rmdir(serverDir, { recursive: true });
            }

            // Cleanup mcp.staging.json entry
            const stagingPath = join(process.cwd(), "mcp.staging.json");
            if (existsSync(stagingPath)) {
                try {
                    const content = await readFile(stagingPath, "utf-8");
                    const config = JSON.parse(content);
                    if (config.mcpServers && config.mcpServers[fw.name]) {
                        delete config.mcpServers[fw.name];
                        await writeFile(stagingPath, JSON.stringify(config, null, 2));
                    }
                } catch (e) {
                    console.error("Failed to cleanup staging config:", e);
                }
            }
        }
    }

    return results;
}

// Allow standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runIntegrationBenchmark().then(console.log).catch(console.error);
}
