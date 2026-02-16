// TODO: [Ingest] This script is an ad-hoc wrapper for Aider.
// It should be converted into a standalone MCP Server (e.g., 'aider-mcp').
// The server should expose tools like 'aider_edit_files', 'aider_chat'.

import { spawn } from "child_process";
import process from "process";

async function main() {
  console.warn(
    "DEPRECATION WARNING: 'src/agents/deepseek_aider.ts' is deprecated and will be removed. Please use the 'aider-mcp' server instead (coming soon).",
  );
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("Error: DEEPSEEK_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // delegate_cli passes [task, file1, file2, ...]
  // We assume the first argument is the task/message.
  const args = process.argv.slice(2);
  const message = args[0];
  const files = args.slice(1);

  // Construct arguments for aider
  const aiderArgs = [
    "aider",
    "--model",
    "deepseek/deepseek-chat",
    "--api-key",
    `deepseek=${apiKey}`,
  ];

  if (message) {
    aiderArgs.push("--message", message);
  }

  // Append files (aider accepts them as positional args)
  if (files.length > 0) {
    aiderArgs.push(...files);
  }

  console.log(
    `[DeepSeek+Aider] Starting aider with model deepseek/deepseek-chat...`,
  );
  console.log(`[DeepSeek+Aider] Message: ${message}`);
  console.log(`[DeepSeek+Aider] Files: ${files.join(", ")}`);

  // Aider is a python tool, so we call it directly (must be in PATH)
  // We remove the first argument 'aider' because spawn takes the command as the first argument
  const child = spawn("aider", aiderArgs.slice(1), {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: apiKey,
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error(`[DeepSeek+Aider] Failed to start aider: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
