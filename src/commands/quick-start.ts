import { intro, outro, select, confirm, isCancel, cancel, note, text } from "@clack/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { join, dirname } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import pc from "picocolors";
import ora from "ora";
import { fileURLToPath } from "url";

// Import demo scripts
import { runAiderDemo } from "../quick-start/demo-scripts/aider.js";
import { runCrewAIDemo } from "../quick-start/demo-scripts/crewai.js";
import { runV0DevDemo } from "../quick-start/demo-scripts/v0dev.js";
import { showBrainMemories } from "../quick-start/brain-demo.js";
import { showSharedContext } from "../quick-start/shared-context.js";

// Logging Transport Wrapper
class LoggingTransport implements Transport {
    constructor(private inner: Transport, private log: (msg: string) => void) {
        inner.onmessage = (msg) => {
            const str = JSON.stringify(msg);
            if (str.length < 200) this.log(pc.dim(`[MCP Rx] ${str}`));
            else this.log(pc.dim(`[MCP Rx] ${str.substring(0, 100)}...`));
            this.onmessage?.(msg);
        };
        inner.onclose = () => this.onclose?.();
        inner.onerror = (e) => this.onerror?.(e);
    }
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    async start() { await this.inner.start(); }
    async send(message: JSONRPCMessage) {
        const str = JSON.stringify(message);
        if (str.length < 200) this.log(pc.dim(`[MCP Tx] ${str}`));
        else this.log(pc.dim(`[MCP Tx] ${str.substring(0, 100)}...`));
        await this.inner.send(message);
    }
    async close() { await this.inner.close(); }
}

export async function quickStart(scenario?: string, demoMode: boolean = false) {
    const isInteractive = !demoMode && process.argv.indexOf("--non-interactive") === -1;

    if (isInteractive) {
        intro(pc.bgBlue(pc.white(" Simple CLI - Quick Start Wizard ")));
    }

    // Determine scenarios to run
    let selectedScenarios: string[] = [];
    if (scenario) {
        selectedScenarios = scenario === "all" ? ["aider", "crewai", "v0dev"] : [scenario];
    } else if (isInteractive) {
        const selected = await select({
            message: "Choose a demo scenario:",
            options: [
                { value: "aider", label: "Coding Agent (Aider)", hint: "Fix bugs automatically" },
                { value: "crewai", label: "Research Team (CrewAI)", hint: "Multi-agent deep dive" },
                { value: "v0dev", label: "UI Generation (v0.dev)", hint: "Text-to-Interface" },
                { value: "all", label: "Run All Demos", hint: "Full tour" },
            ],
        });

        if (isCancel(selected)) {
            cancel("Operation cancelled.");
            return;
        }
        selectedScenarios = selected === "all" ? ["aider", "crewai", "v0dev"] : [selected as string];
    } else {
        // Default to all in non-interactive mode if not specified
        selectedScenarios = ["aider", "crewai", "v0dev"];
    }

    const spinner = ora();
    const tempDir = await mkdtemp(join(tmpdir(), "simple-cli-demo-"));
    let client: Client | null = null;

    try {
        if (isInteractive) spinner.start("Starting Tutorial MCP Server...");

        // Resolve server script path dynamically
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const isTs = __filename.endsWith(".ts");

        // Adjusted path resolution:
        // In src: src/commands/quick-start.ts -> src/quick-start/tutorial-server.ts
        // In dist: dist/commands/quick-start.js -> dist/quick-start/tutorial-server.js
        const serverScript = join(__dirname, "..", "quick-start", isTs ? "tutorial-server.ts" : "tutorial-server.js");

        const command = isTs ? "npx" : "node";
        const args = isTs ? ["tsx", serverScript] : [serverScript];

        const transport = new StdioClientTransport({
            command,
            args,
            env: {
                ...process.env,
                MOCK_EMBEDDINGS: "true",
                JULES_COMPANY: "quick_start_demo",
            }
        });

        const loggingTransport = new LoggingTransport(transport, (msg) => {
            // console.log(msg); // Uncomment for debug
        });

        client = new Client({ name: "simple-cli-quick-start", version: "1.0.0" }, { capabilities: {} });
        await client.connect(loggingTransport);

        if (isInteractive) spinner.succeed("Connected to Tutorial Server.");

        // Run scenarios
        for (const s of selectedScenarios) {
            console.log(pc.bold(`\n--- Running Scenario: ${s} ---`));
            if (s === "aider") await runAiderDemo(client, tempDir);
            else if (s === "crewai") await runCrewAIDemo(client);
            else if (s === "v0dev") await runV0DevDemo(client);
        }

        // Important: Close client/transport to release DB locks before accessing Brain directly
        if (client) {
            await client.close();
            client = null;
        }

        // Wait a bit for process cleanup and lock release
        await new Promise(r => setTimeout(r, 1000));

        // Show Brain & Context
        console.log(pc.bold("\n--- Inspecting Shared Memory ---"));
        await showBrainMemories("quick_start_demo");
        await showSharedContext("quick_start_demo");

        if (isInteractive) {
            outro("Demo completed! You've seen how Simple CLI integrates disparate agents into a unified workforce.");
        }

    } catch (e: any) {
        if (isInteractive) spinner.fail(`Demo failed: ${e.message}`);
        console.error(e);
    } finally {
        if (client) await client.close();

        // Cleanup temp dir
        await rm(tempDir, { recursive: true, force: true });

        // Cleanup Brain
        if (isInteractive) {
            const shouldClean = await confirm({
                message: "Clean up tutorial data (.agent/brain/quick_start_demo)?",
                initialValue: true
            });
            if (shouldClean && !isCancel(shouldClean)) {
               await cleanupBrain();
               console.log(pc.dim("Cleanup complete."));
            }
        } else {
            // Always clean up in non-interactive/test mode
            await cleanupBrain();
        }
    }
}

async function cleanupBrain() {
    const brainDir = join(process.cwd(), ".agent", "brain", "quick_start_demo");
    const contextDir = join(process.cwd(), ".agent", "companies", "quick_start_demo");
    await rm(brainDir, { recursive: true, force: true });
    await rm(contextDir, { recursive: true, force: true });
}
