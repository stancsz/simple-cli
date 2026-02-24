import { createLLM } from "../../llm.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, basename } from "path";
import { writeFile, mkdir } from "fs/promises";

const execFileAsync = promisify(execFile);

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
            files: results
        };

    } catch (error: any) {
        return { error: "Scaffold generation failed.", details: error.message };
    }
}
