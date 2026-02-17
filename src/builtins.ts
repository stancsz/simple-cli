import { spawn } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { ContextManager } from "./context/manager.js";

export async function delegate_cli(
  command: string,
  args: string[],
  contextManager: ContextManager,
  options: { cwd?: string } = {}
): Promise<string> {
  const context = await contextManager.readContext();
  const contextStr = JSON.stringify(context, null, 2);
  const contextBlock = `# Context:\n${contextStr}\n\n`;

  // Agents that support context via stdin
  const stdinAgents = ["aider", "claude", "llm", "sim", "gpt"];

  // Check if the command (or the first arg if command is 'npx' or 'python') matches
  const cmdName = command.split("/").pop() || command;
  const isStdinAgent = stdinAgents.some(a => cmdName.includes(a)) ||
                       (args.length > 0 && stdinAgents.some(a => args[0].includes(a)));

  let finalArgs = [...args];
  let stdinContent = "";

  if (isStdinAgent) {
    // Inject into stdin
    stdinContent = contextBlock;
    // Note: The task itself might be in args or stdin.
    // If it's in args, we might need to rely on the agent reading BOTH args and stdin,
    // or we might need to prepend to the task argument if possible.
    // However, "pipe ... before the task" usually implies the task is also piped or the agent reads stdin context + args task.
    // For 'aider', it reads stdin if no message arg, or we can use --message.
    // But sticking to the prompt's instruction: "pipe ... before the task".
  } else {
    // File-based injection
    const tempContextPath = join(process.cwd(), ".agent", "temp_context.md");

    if (!existsSync(dirname(tempContextPath))) {
        await mkdir(dirname(tempContextPath), { recursive: true });
    }

    await writeFile(tempContextPath, contextBlock);
    finalArgs.push("--context-file", tempContextPath);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: true // Use shell to handle command resolution
    });

    let stdout = "";
    let stderr = "";

    if (stdinContent) {
        child.stdin.write(stdinContent);
        child.stdin.end();
    }

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
        reject(err);
    });
  });
}
