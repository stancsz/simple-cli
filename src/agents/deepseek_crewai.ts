import { spawn } from "child_process";
import process from "process";
import { join } from "path";

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: DEEPSEEK_API_KEY or OPENAI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // The task description is passed as the first argument
  const args = process.argv.slice(2);
  const task = args.join(" "); // Join all args as a single task string

  if (!task) {
    console.error("Error: No task description provided.");
    process.exit(1);
  }

  // Check if crewai is installed
  const checkCrew = spawn("python3", ["-c", "import crewai"], { stdio: "ignore" });

  const crewInstalled = await new Promise<boolean>((resolve) => {
    checkCrew.on("exit", (code) => resolve(code === 0));
  });

  if (!crewInstalled) {
    console.error("Error: 'crewai' python package is not installed.");
    console.error("Please install it using: pip install crewai");
    console.error("Or: uv pip install crewai");
    process.exit(1);
  }

  const scriptPath = join(process.cwd(), "src", "agents", "crewai", "generic_crew.py");

  console.log(`[DeepSeek+CrewAI] Starting CrewAI with task: "${task}"...`);

  // Map DeepSeek to OpenAI env vars if needed
  const env = {
    ...process.env,
    OPENAI_API_KEY: apiKey,
    // If using DeepSeek, we set OPENAI_BASE_URL to DeepSeek's API
    ...(process.env.DEEPSEEK_API_KEY ? {
      OPENAI_BASE_URL: "https://api.deepseek.com",
      OPENAI_MODEL_NAME: "deepseek-chat"
    } : {})
  };

  const child = spawn("python3", [scriptPath, task], {
    stdio: "inherit",
    env: env
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error(`[DeepSeek+CrewAI] Failed to start python script: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
