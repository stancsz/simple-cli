// TODO: [Ingest] Convert to 'claude-code-mcp' server.
// Instead of this script, use an MCP server that wraps the 'claude' CLI.

import { spawn } from "child_process";
import process from "process";

async function main() {
  console.warn(
    "DEPRECATION WARNING: 'src/agents/deepseek_claude.ts' is deprecated and will be removed. Please use the 'claude-mcp' server instead (coming soon).",
  );
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("Error: DEEPSEEK_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const userArgs = process.argv.slice(2);

  // Construct arguments for claude code
  const claudeArgs = ["@anthropic-ai/claude-code", ...userArgs];

  console.log(
    `[DeepSeek+Claude] Starting claude code with model deepseek/deepseek-chat...`,
  );

  // Use shell: false to avoid argument splitting issues
  const child = spawn("npx", claudeArgs, {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      // Configure DeepSeek as per documentation
      // https://api-docs.deepseek.com/guides/anthropic_api
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_AUTH_TOKEN: apiKey, // Some docs suggest this too
      ANTHROPIC_MODEL: "deepseek-chat",
      ANTHROPIC_SMALL_FAST_MODEL: "deepseek-chat",
      // Optional timeouts
      API_TIMEOUT_MS: "600000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error(`[DeepSeek+Claude] Failed to start claude: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
