import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, resolve, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const server = new McpServer({ name: "filesystem", version: "1.0.0" });
const cwd = process.cwd();

function safePath(p: string) {
  const resolved = resolve(cwd, p);
  if (!resolved.startsWith(cwd)) throw new Error("Path traversal forbidden");
  return resolved;
}

server.tool("read_file", "Read file", { filepath: z.string() }, async ({ filepath }) => {
  try {
    const content = await readFile(safePath(filepath), "utf-8");
    return { content: [{ type: "text", text: content }] };
  } catch(e: any) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
});

server.tool("write_file", "Write file", { filepath: z.string(), content: z.string() }, async ({ filepath, content }) => {
   try {
     const p = safePath(filepath);
     await mkdir(dirname(p), { recursive: true });
     await writeFile(p, content);
     return { content: [{ type: "text", text: `Successfully wrote to ${filepath}` }] };
   } catch(e: any) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
});

server.tool("list_files", "List files", { path: z.string().optional() }, async ({ path = "." }) => {
   try {
     const p = safePath(path);
     const files = await readdir(p);
     return { content: [{ type: "text", text: files.join("\n") }] };
   } catch(e: any) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
});

server.tool("run_shell", "Run shell command", { command: z.string() }, async ({ command }) => {
    try {
        const { stdout, stderr } = await execAsync(command, { cwd });
        return { content: [{ type: "text", text: stdout + (stderr ? "\nSTDERR:\n" + stderr : "") }] };
    } catch(e: any) {
         return { content: [{ type: "text", text: `Error: ${e.message}\n${e.stdout || ""}\n${e.stderr || ""}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Filesystem MCP Server running on stdio");
}

main().catch(console.error);
