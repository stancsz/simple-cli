import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Server
const server = new McpServer({
  name: "roo-code-integration",
  version: "1.0.0",
});

const MOCK_CLI_PATH = join(__dirname, "mock_cli.ts");

// Helper to spawn the mock CLI
async function runRoo(command: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    // We use 'tsx' to run the typescript mock directly
    const child = spawn("npx", ["tsx", MOCK_CLI_PATH, command, ...args], {
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Roo Code CLI failed with code ${code}: ${stderr}`));
      } else {
        try {
            // Attempt to parse JSON output
            const json = JSON.parse(stdout.trim());
            resolve(json);
        } catch (e) {
            // Fallback for non-JSON output (though our mock uses JSON)
            resolve({ raw_output: stdout, error: "Failed to parse JSON" });
        }
      }
    });
  });
}

// Define Tool: Execute Task
server.tool(
    "execute_task",
    "Execute a general task using Roo Code's autonomous agent capabilities.",
    {
        task: z.string().describe("The description of the task to execute."),
        session_id: z.string().optional().describe("Optional session ID to maintain context.")
    },
    async ({ task, session_id }) => {
        try {
            const args = [task];
            if (session_id) args.push("--session-id", session_id);

            const result = await runRoo("task", args);
            return {
                content: [{ type: "text", text: `Task Execution Result:\n${result.result}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error executing task: ${error.message}` }],
                isError: true
            };
        }
    }
);

// Define Tool: Review Code (Analyze)
server.tool(
  "roo_review_code",
  "Review source code using Roo Code's advanced static analysis engine to find bugs, security issues, and complexity hotspots.",
  {
    file_path: z.string().describe("The path to the file to review"),
    session_id: z.string().optional().describe("Optional session ID to maintain context.")
  },
  async ({ file_path, session_id }) => {
    try {
      const args = [file_path];
      if (session_id) args.push("--session-id", session_id);

      const result = await runRoo("analyze", args);
      return {
        content: [{
            type: "text",
            text: `## Roo Code Analysis for ${file_path}\n\n**Summary**: ${result.summary}\n\n**Issues Found**:\n${result.issues.map((i: any) => `- [${i.severity.toUpperCase()}] ${i.message} (Line ${i.line})\n  Suggestion: ${i.suggestion}`).join("\n")}\n\n**Metrics**:\n- Complexity: ${result.metrics.complexity_score}\n- Maintainability: ${result.metrics.maintainability_index}`
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error running analysis: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Define Tool: Fix Code
server.tool(
  "roo_fix_code",
  "Apply automated fixes to a file based on Roo Code's analysis. Use with caution.",
  {
    file_path: z.string().describe("The path to the file to fix"),
    strategy: z.enum(["conservative", "aggressive"]).optional().describe("The fix strategy to apply. Defaults to conservative."),
  },
  async ({ file_path, strategy }) => {
    try {
      const result = await runRoo("fix", [file_path, ...(strategy ? ["--strategy", strategy] : [])]);
      return {
        content: [{
            type: "text",
            text: `## Roo Code Fix Applied\n\n**Status**: ${result.status}\n\n**Changes**:\n${result.changes_applied.join("\n- ")}\n\n**Diff Preview**:\n\`\`\`diff\n${result.diff}\n\`\`\``
        }],
      };
    } catch (error: any) {
       return {
        content: [{ type: "text", text: `Error applying fix: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// Define Tool: Generate Documentation
server.tool(
  "roo_generate_docs",
  "Generate comprehensive Markdown documentation for a specific file or module.",
  {
    file_path: z.string().describe("The path to the source file"),
    output_path: z.string().optional().describe("Optional path to save the generated documentation. If not provided, returns content."),
  },
  async ({ file_path, output_path }) => {
    try {
      if (output_path) {
          // Security check: output path must be within CWD
          const resolved = join(process.cwd(), output_path);
          if (!resolved.startsWith(process.cwd())) {
              throw new Error("Security Violation: Cannot write outside of current working directory.");
          }
      }

      const args = [file_path];
      if (output_path) {
          args.push("--output", output_path);
      }
      const result = await runRoo("docs", args);

      if (result.output_path) {
          return {
              content: [{ type: "text", text: `Documentation generated successfully at: ${result.output_path}` }]
          };
      } else {
          return {
              content: [{ type: "text", text: result.content }]
          };
      }
    } catch (error: any) {
       return {
        content: [{ type: "text", text: `Error generating docs: ${error.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roo Code MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
