import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface AgentConfig {
  command: string;
  args: string[];
  description: string;
  supports_stdin?: boolean;
  env?: Record<string, string>;
  context_flag?: string;
}

export interface TaskConfig {
  id: string;
  cron: string;
  command: string; // The command or prompt to execute
  description: string;
  enabled?: boolean;
}

export interface SchedulerConfig {
  enabled: boolean;
  tasks: TaskConfig[];
}

export interface Config {
  mcpServers?: Record<string, any>;
  agents?: Record<string, AgentConfig>;
  scheduler?: SchedulerConfig;
  yoloMode?: boolean;
  autoDecisionTimeout?: number;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const locations = [join(cwd, "mcp.json"), join(cwd, ".agent", "config.json")];

  let config: Config = {};

  for (const loc of locations) {
    if (existsSync(loc)) {
      try {
        const content = await readFile(loc, "utf-8");
        config = JSON.parse(content);
        break;
      } catch (e) {
        console.error(`Failed to parse config at ${loc}:`, e);
      }
    }
  }

  // Default configuration for Open Claw integration (Meta-Orchestrator sub-agent)
  if (!config.agents) config.agents = {};
  if (!config.agents.claw) {
    const env: Record<string, string> = {};
    if (process.env.DEEPSEEK_API_KEY) {
      env.ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic";
      env.ANTHROPIC_API_KEY = process.env.DEEPSEEK_API_KEY;
      env.ANTHROPIC_AUTH_TOKEN = process.env.DEEPSEEK_API_KEY;
      env.ANTHROPIC_MODEL = "deepseek-chat";
      env.ANTHROPIC_SMALL_FAST_MODEL = "deepseek-chat";
      env.API_TIMEOUT_MS = "600000";
      env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    }

    config.agents.claw = {
      command: "npx",
      args: [
        "openclaw",
        "agent",
        "--local",
        "--json",
        "--session-id",
        "simple-cli-delegate",
        "--message",
      ],
      description: "Delegate tasks to Open Claw (local execution).",
      supports_stdin: false,
      env,
    };
  }

  if (!config.agents.deepseek_aider) {
    config.agents.deepseek_aider = {
      command: "npx",
      args: ["tsx", "src/agents/deepseek_aider.ts"],
      description: "Delegate coding tasks to Aider using DeepSeek V3.",
      supports_stdin: false,
      context_flag: "", // Aider accepts files as positional arguments
    };
  }

  if (!config.agents.deepseek_opencode) {
    config.agents.deepseek_opencode = {
      command: "npx",
      args: ["tsx", "src/agents/deepseek_opencode.ts"],
      description: "Delegate tasks to OpenCode using DeepSeek V3.",
      supports_stdin: false,
    };
  }

  if (!config.agents.deepseek_claude) {
    config.agents.deepseek_claude = {
      command: "npx",
      args: ["tsx", "src/agents/deepseek_claude.ts"],
      description: "Delegate tasks to Claude Code using DeepSeek V3.",
      supports_stdin: false,
    };
  }

  if (!config.agents.openai_codex) {
    config.agents.openai_codex = {
      command: "npx",
      args: ["tsx", "src/agents/openai_codex.ts"],
      description: "Delegate coding tasks to OpenAI Codex (GPT-4o).",
      supports_stdin: false,
    };
  }

  return config;
}
