import { createLLM } from "../../llm.js";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { join, basename } from "path";
import { writeFile, mkdir, readFile } from "fs/promises";
import { testTemplate } from "./templates/test_template.js";
import { MCP } from "../../mcp.js"; // Import MCP for Brain integration

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export async function analyze_cli_tool(target_command: string, help_text?: string): Promise<any> {
    let commandOutput = help_text;

    if (!commandOutput) {
        try {
            // Security: Use execFile to avoid shell execution
            const { stdout, stderr } = await execFileAsync(target_command, ['--help']);
            commandOutput = stdout || stderr;
        } catch (error: any) {
             // Some commands exit with non-zero code on --help or if command not found
             if (error.stdout || error.stderr) {
                 commandOutput = error.stdout || error.stderr;
             } else {
                 return {
                     error: `Failed to execute '${target_command} --help'. Please provide help_text manually.`,
                     details: error.message
                 };
             }
        }
    }

    if (!commandOutput || commandOutput.trim().length === 0) {
        return { error: "No help text provided or captured." };
    }

    const llm = createLLM();
    const systemPrompt = `You are an expert CLI analyzer for the Model Context Protocol (MCP).
Your goal is to analyze CLI help text and extract structured information to build an MCP server.

You MUST respond with a valid JSON object in the following format (and NOTHING else):
{
  "tool": "analysis_result",
  "args": {
    "description": "A brief description of the tool",
    "usage_patterns": ["example 1", "example 2"],
    "tools": [
      {
        "name": "function_name",
        "description": "What this tool does",
        "args": [
            { "name": "arg_name", "type": "string", "description": "arg description" }
        ]
      }
    ]
  }
}

Analyze the provided help text and map commands/flags to potential MCP tools.
- Infer 'analyze' or 'read' type tools for information gathering.
- Infer 'action' or 'write' type tools for state changes.
- Ensure tool names are snake_case.
`;

    const userPrompt = `Analyze the following CLI help text for '${target_command}':\n\n${commandOutput}`;

    try {
        const response = await llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

        // Check if the LLM returned a tool call structure
        if (response.tool === "analysis_result" && response.args) {
            return response.args;
        }

        // If not, check if 'tools' array in response has it (multi-tool support in LLM class)
        if (response.tools && response.tools.length > 0) {
            const found = response.tools.find(t => t.tool === "analysis_result");
            if (found) return found.args;
        }

        // Fallback: Check raw output for JSON
        try {
            const match = response.raw.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.tool === "analysis_result" && parsed.args) return parsed.args;
                if (parsed.description && parsed.tools) return parsed; // Direct object
            }
        } catch (e) {
            // Ignore parse error
        }

        return {
            error: "Failed to parse LLM analysis.",
            raw: response.raw
        };

    } catch (error: any) {
        return {
            error: "LLM generation failed.",
            details: error.message
        };
    }
}

export async function analyze_framework_source(source_type: 'cli' | 'sdk' | 'gui', source_path: string): Promise<any> {
    if (source_type === 'cli') {
        // For CLI, source_path is treated as the command name
        return analyze_cli_tool(source_path);
    }

    if (source_type === 'gui') {
        return {
            tool: "analysis_result",
            args: {
                description: `GUI Framework Analysis for '${source_path}'`,
                recommendation: "This framework appears to be a GUI-based application. Standard CLI/SDK integration is not applicable.",
                suggested_strategy: "Use the Desktop Orchestrator with the 'Stagehand' or 'Anthropic Computer Use' driver to interact with this application visually.",
                next_steps: [
                    "1. Ensure 'desktop_orchestrator' is running.",
                    "2. Use 'desktop_orchestrator.navigate' to open the application URL or interface.",
                    "3. Use 'desktop_orchestrator.click' and 'desktop_orchestrator.type' to simulate user interactions."
                ]
            }
        };
    }

    if (source_type === 'sdk') {
        let content = '';
        try {
            if (source_path.startsWith('http://') || source_path.startsWith('https://')) {
                const res = await fetch(source_path);
                if (!res.ok) throw new Error(`Failed to fetch URL: ${res.statusText}`);
                content = await res.text();
            } else {
                content = await readFile(source_path, 'utf-8');
            }
        } catch (error: any) {
            return { error: `Failed to read source path '${source_path}'.`, details: error.message };
        }

        const llm = createLLM();
        const systemPrompt = `You are an expert SDK analyzer for the Model Context Protocol (MCP).
Your goal is to analyze an SDK definition (OpenAPI spec, TypeScript definition, or Python docstrings) and extract structured information to build an MCP server.

You MUST respond with a valid JSON object in the following format (and NOTHING else):
{
  "tool": "analysis_result",
  "args": {
    "description": "A brief description of the SDK",
    "usage_patterns": ["example 1", "example 2"],
    "tools": [
      {
        "name": "function_name",
        "description": "What this function does",
        "args": [
            { "name": "arg_name", "type": "string", "description": "arg description" }
        ]
      }
    ]
  }
}

Analyze the provided SDK definition and map functions/endpoints to potential MCP tools.
- Ensure tool names are snake_case.
- Infer appropriate types for arguments.
`;

        const userPrompt = `Analyze the following SDK definition:\n\n${content.substring(0, 30000)}`; // Truncate to avoid context limit issues

        try {
            const response = await llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

            // Check if the LLM returned a tool call structure
            if (response.tool === "analysis_result" && response.args) {
                return response.args;
            }
            if (response.tools && response.tools.length > 0) {
                const found = response.tools.find(t => t.tool === "analysis_result");
                if (found) return found.args;
            }
            // Fallback: Check raw output for JSON
            try {
                const match = response.raw.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    if (parsed.tool === "analysis_result" && parsed.args) return parsed.args;
                    if (parsed.description && parsed.tools) return parsed; // Direct object
                }
            } catch (e) {
                // Ignore parse error
            }

            return {
                error: "Failed to parse LLM analysis.",
                raw: response.raw
            };

        } catch (error: any) {
            return {
                error: "LLM generation failed.",
                details: error.message
            };
        }
    }

    return { error: `Unsupported source_type: '${source_type}'.` };
}

export async function generate_mcp_scaffold(framework_name: string, analysis_result: any): Promise<any> {
    // Security: Sanitize framework_name to prevent path traversal
    const safeFrameworkName = basename(framework_name);
    if (safeFrameworkName !== framework_name || framework_name.includes('..') || framework_name.includes('/') || framework_name.includes('\\')) {
        return { error: "Invalid framework name. Must be a valid directory name without path separators." };
    }

    const llm = createLLM();
    const systemPrompt = `You are an expert TypeScript developer specializing in MCP (Model Context Protocol) servers.
Your task is to generate a complete MCP server scaffold based on the provided analysis.

You MUST respond with a valid JSON object containing the file contents for the new server.
The JSON structure should be:
{
  "files": {
    "index.ts": "The complete TypeScript code for the server, including imports, tool definitions (using 'zod'), and server startup.",
    "README.md": "Documentation on how to use the server and its tools.",
    "config.json": "A JSON file containing the server name, version, and a 'command' object compatible with mcp.json registration."
  }
}

Guidelines for index.ts:
- Use '@modelcontextprotocol/sdk/server/mcp.js' and '@modelcontextprotocol/sdk/server/stdio.js'.
- Use 'zod' for schemas.
- Implement tools based on the analysis.
- Use 'child_process' (spawn or exec) to call the underlying CLI tool.
- Ensure proper error handling.
- Follow established patterns for tool definitions (server.tool).
`;

    const userPrompt = `Generate an MCP server for '${framework_name}' using this analysis:\n${JSON.stringify(analysis_result, null, 2)}`;

    try {
        const response = await llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

        let files: any = {};

        // Attempt to extract files from tool call or raw JSON
        try {
             if (response.tool === "scaffold_result" && response.args?.files) {
                 files = response.args.files;
             } else if (response.tools?.find(t => t.tool === "scaffold_result")?.args?.files) {
                 files = response.tools.find(t => t.tool === "scaffold_result")!.args.files;
             } else {
                 const match = response.raw.match(/\{[\s\S]*\}/);
                 if (match) {
                     const parsed = JSON.parse(match[0]);
                     if (parsed.files) files = parsed.files;
                     // Fallback: maybe keys are direct
                     else if (parsed["index.ts"] || parsed.index_ts) files = parsed;
                 }
             }
        } catch (e) {
             return { error: "Failed to parse LLM scaffold generation.", raw: response.raw };
        }

        if (Object.keys(files).length === 0) {
            return { error: "No files generated.", raw: response.raw };
        }

        const targetDir = join(process.cwd(), "src", "mcp_servers", safeFrameworkName);
        await mkdir(targetDir, { recursive: true });

        const results = [];
        for (const [filename, content] of Object.entries(files)) {
            // Basic sanitization to prevent directory traversal
            if (filename.includes("..") || filename.includes("/")) continue;

            const filePath = join(targetDir, filename);
            await writeFile(filePath, content as string);
            results.push(filePath);
        }

        return {
            success: true,
            message: `Generated MCP server for '${safeFrameworkName}' at ${targetDir}`,
            files: results,
            usage: response.usage
        };

    } catch (error: any) {
        return { error: "Scaffold generation failed.", details: error.message };
    }
}

export async function integrate_framework(framework_name: string, source_type: 'cli' | 'sdk' | 'gui', source_path: string): Promise<any> {
    const startTime = Date.now();
    let outcome = "pending";
    let failureDetails = "";
    let loc = 0;
    let totalTokens = 0;

    // 1. Analyze
    const analysis = await analyze_framework_source(source_type, source_path);
    if (analysis.error) return analysis;

    // 2. Generate Scaffold
    const scaffoldResult = await generate_mcp_scaffold(framework_name, analysis);
    if (scaffoldResult.error) return scaffoldResult;

    // Capture usage if available
    if (scaffoldResult.usage) {
        totalTokens = scaffoldResult.usage.totalTokens || 0;
    }

    // Calculate Lines of Code
    if (scaffoldResult.files && Array.isArray(scaffoldResult.files)) {
        try {
            for (const filePath of scaffoldResult.files) {
                const content = await readFile(filePath, "utf-8");
                loc += content.split('\n').length;
            }
        } catch (e) {
            console.error("Failed to calculate LoC:", e);
        }
    }

    const serverDir = join(process.cwd(), "src", "mcp_servers", basename(framework_name));
    const testFilePath = join(serverDir, "basic.test.ts");
    const serverEntry = join(serverDir, "index.ts"); // generate_mcp_scaffold produces index.ts

    // 3. Generate Test File
    const testContent = testTemplate.replace("{{SERVER_PATH}}", serverEntry);
    await writeFile(testFilePath, testContent);

    // 4. Run Test
    try {
        // Use npx tsx to run the test file
        // Ensure we are in the root directory context
        await execAsync(`npx tsx "${testFilePath}"`, {
            timeout: 30000, // 30s timeout
            env: { ...process.env, PATH: process.env.PATH }
        });
        outcome = "success";

    } catch (error: any) {
         outcome = "failure";
         failureDetails = error.message;

         // Log failure to Brain
         await logToBrain(framework_name, "failure", Date.now() - startTime, loc, totalTokens, failureDetails);

         return {
             error: "Validation failed.",
             details: error.message,
             stdout: error.stdout,
             stderr: error.stderr
         };
    }

    // 5. Update mcp.staging.json
    const stagingPath = join(process.cwd(), "mcp.staging.json");
    let stagingConfig: any = { mcpServers: {} };

    try {
        const content = await readFile(stagingPath, "utf-8");
        stagingConfig = JSON.parse(content);
    } catch (e) {
        // File might not exist
    }

    if (!stagingConfig.mcpServers) stagingConfig.mcpServers = {};

    stagingConfig.mcpServers[framework_name] = {
        command: "npx",
        args: ["tsx", `src/mcp_servers/${basename(framework_name)}/index.ts`],
        env: {}
    };

    await writeFile(stagingPath, JSON.stringify(stagingConfig, null, 2));

    // Log success to Brain
    await logToBrain(framework_name, "success", Date.now() - startTime, loc, totalTokens);

    return {
        success: true,
        message: `Framework '${framework_name}' integrated and validated successfully.`,
        scaffold_path: serverDir,
        staging_entry: stagingConfig.mcpServers[framework_name]
    };
}

async function logToBrain(frameworkName: string, outcome: string, duration: number, loc: number, tokens: number, details?: string) {
    try {
        const mcp = new MCP();
        await mcp.init();

        // We need to ensure Brain is running.
        // If this process is running inside an environment where Brain is available, we might connect.
        // But since we are a standalone tool/process here, we likely need to spawn it or rely on existing config.
        // mcp.startServer will spawn it if config is correct.

        // Note: In production, Brain might be a long-running service.
        // If mcp.json points to a URL, startServer will connect.
        // If it points to a command, startServer will spawn.
        // Since we are recursive, we are careful.

        // Check if 'brain' is configured in mcp.json (via init())
        try {
            await mcp.startServer("brain");
        } catch (e: any) {
            // If it fails (e.g., "already running" or connection issue), we log and proceed.
            // But usually startServer throws if it can't start.
            // If it says "already running" (because we track clients), it returns a string.
            // But this is a new MCP instance, so it won't know about other processes.
            // It will try to spawn.
            // If spawn fails, we catch it.
        }

        const brain = mcp.getClient("brain");
        if (brain) {
            await brain.callTool({
                name: "brain_store",
                arguments: {
                    taskId: `framework-integration-${frameworkName}-${Date.now()}`,
                    request: `Integrate framework: ${frameworkName}`,
                    solution: `Outcome: ${outcome}\nLoC: ${loc}\nDuration: ${duration}ms\nDetails: ${details || "None"}`,
                    type: "framework_integration_outcome",
                    tokens: tokens,
                    duration: duration,
                    company: "internal" // Use 'internal' or similar for system tasks
                }
            });
            // Stop server to release resources/locks if spawned
            await mcp.stopServer("brain");
        }
    } catch (e) {
        console.warn(`[FrameworkAnalyzer] Failed to log outcome to Brain: ${(e as Error).message}`);
    }
}
