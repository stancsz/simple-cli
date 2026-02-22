import { intro, outro, select, confirm, isCancel, cancel, note, text } from "@clack/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import pc from "picocolors";
import ora from "ora";

// Logging Transport Wrapper
class LoggingTransport implements Transport {
    constructor(private inner: Transport, private log: (msg: string) => void) {
        inner.onmessage = (msg) => {
            // Filter out notifications to reduce noise if needed, but for demo we show everything
            this.log(pc.dim(`[MCP Rx] ${JSON.stringify(msg)}`));
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
        this.log(pc.dim(`[MCP Tx] ${JSON.stringify(message)}`));
        await this.inner.send(message);
    }
    async close() { await this.inner.close(); }
}

export async function quickStart(scenario?: string, demoMode: boolean = false) {
    intro(pc.bgBlue(pc.white(" Simple CLI - Quick Start Wizard ")));

    if (!scenario) {
        const selected = await select({
            message: "Choose a demo scenario:",
            options: [
                { value: "bug-fix", label: "Fix a Bug (Aider)", hint: "Automated debugging & patching" },
                { value: "research", label: "Research Topic (CrewAI)", hint: "Multi-agent deep dive" },
                { value: "ui", label: "Generate UI (v0.dev)", hint: "Text-to-Interface generation" },
                { value: "tour", label: "System Tour", hint: "Learn about the architecture" },
            ],
        });

        if (isCancel(selected)) {
            cancel("Operation cancelled.");
            return;
        }
        scenario = selected as string;
    }

    if (scenario === "tour") {
        await showTour();
        return;
    }

    await runScenario(scenario, demoMode);

    // After scenario, ask if they want to generate config
    if (!process.env.JULES_TEST_MODE) {
        const shouldGen = await confirm({
            message: "Do you want to generate an mcp.json snippet for these tools?",
        });
        if (shouldGen && !isCancel(shouldGen)) {
            generateMcpConfig();
        }
    }

    outro("Demo completed! You can run 'simple quick-start' again to try other scenarios.");
}

async function showTour() {
    note(
        `Simple CLI is a Meta-Orchestrator that integrates various AI frameworks as 'Subordinate Agents'.

        It uses the Model Context Protocol (MCP) to standardize communication.

        Integrations:
        - **Jules**: The core orchestrator.
        - **Aider**: Best-in-class coding agent. (Avg integration time: 1 day)
        - **CrewAI**: Multi-agent research teams. (Avg integration time: 3 days)
        - **v0.dev**: React/Vue UI generation. (Avg integration time: 1 day)

        The 'Brain' (.agent/brain/) allows all these agents to share memory.`,
        "System Tour"
    );
}

async function runScenario(scenario: string, demoMode: boolean) {
    const spinner = ora();
    const tempDir = await mkdtemp(join(tmpdir(), "simple-cli-demo-"));
    const logs: string[] = [];

    // Helper to log MCP traffic
    const logTraffic = (msg: string) => {
        logs.push(msg);
    };

    try {
        spinner.start(`Setting up environment for ${scenario}...`);

        // Setup initial files
        if (scenario === "bug-fix") {
            await writeFile(join(tempDir, "bug.py"), `def add(a, b):\n    return a - b  # Bug here\n`);
        }

        spinner.text = "Starting MCP Server...";

        // Determine server command
        // For Quick Start, we default to the mock server to ensure it works out-of-the-box
        // unless explicit environment variables are detected AND --real is passed (omitted for now)
        // or we just use mock always for consistent demo experience as per requirement "demonstrate capabilities".

        const serverScript = join(process.cwd(), "scripts", "quick-start-demo", "mock_server.ts");
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", serverScript],
        });

        const loggingTransport = new LoggingTransport(transport, logTraffic);
        const client = new Client({ name: "simple-cli-demo", version: "1.0.0" }, { capabilities: {} });

        await client.connect(loggingTransport);
        spinner.succeed("Connected to MCP Server.");

        console.log(pc.yellow("\n--- Raw MCP Communication Log ---"));

        // Execute Tool
        let result: any;
        if (scenario === "bug-fix") {
            spinner.start("Requesting Aider to fix the bug...");
            result = await client.callTool({
                name: "aider_chat",
                arguments: {
                    message: "Fix the bug in bug.py",
                    files: [join(tempDir, "bug.py")]
                }
            });
            spinner.succeed("Aider finished execution.");
        } else if (scenario === "research") {
            spinner.start("Starting CrewAI research team...");
            result = await client.callTool({
                name: "start_crew",
                arguments: {
                    task: "Research the future of AI agents in 2025"
                }
            });
            spinner.succeed("CrewAI finished research.");
        } else if (scenario === "ui") {
            spinner.start("Generating UI with v0.dev...");
            result = await client.callTool({
                name: "v0dev_generate_component",
                arguments: {
                    prompt: "A login form with email and password fields, using Tailwind CSS."
                }
            });
            spinner.succeed("v0.dev generated component.");
        }

        // Display Logs (filtered)
        logs.forEach(l => console.log(l));

        console.log(pc.yellow("--- End Log ---\n"));

        // Display Result
        if (result && result.content) {
            note(result.content[0].text, "Agent Output");
        }

        await client.close();

    } catch (e: any) {
        spinner.fail(`Scenario failed: ${e.message}`);
        console.error(e);
    } finally {
        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    }
}

function generateMcpConfig() {
    const config = {
        mcpServers: {
            aider: {
                command: "npx",
                args: ["tsx", "src/mcp_servers/aider-server.ts"],
                env: { "DEEPSEEK_API_KEY": "your-key-here" }
            },
            crewai: {
                command: "npx",
                args: ["tsx", "src/mcp_servers/crewai/index.ts"],
                env: { "OPENAI_API_KEY": "your-key-here" }
            },
            v0dev: {
                command: "npx",
                args: ["tsx", "src/mcp_servers/v0dev/index.ts"],
                env: { "V0DEV_API_KEY": "your-key-here" }
            }
        }
    };

    console.log(pc.green("\nHere is a snippet for your mcp.json:"));
    console.log(JSON.stringify(config, null, 2));
    console.log(pc.dim("\nCopy this into your project's mcp.json to enable these tools permanently."));
}
