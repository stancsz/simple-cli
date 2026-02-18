import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";

interface AgentConfig {
  role: string;
  goal: string;
  backstory: string;
  allow_delegation?: boolean;
  verbose?: boolean;
}

interface Message {
  from_agent: string;
  to_agent: string;
  task: string;
  message: string;
}

export class CrewAIServer {
  private server: McpServer;
  private agents: AgentConfig[] = [];
  private negotiations: Message[] = [];

  constructor() {
    this.server = new McpServer({
      name: "crewai-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "spawn_subagent",
      "Spawn a new CrewAI sub-agent with a specific role and goal.",
      {
        role: z.string().describe("The role of the agent (e.g., 'Researcher')."),
        goal: z.string().describe("The goal of the agent."),
        backstory: z.string().describe("The backstory of the agent."),
        allow_delegation: z.boolean().optional().describe("Whether the agent can delegate tasks."),
        verbose: z.boolean().optional().describe("Whether the agent should be verbose."),
      },
      async ({ role, goal, backstory, allow_delegation, verbose }) => {
        return {
          content: [
            {
              type: "text",
              text: this.spawnSubagent(role, goal, backstory, allow_delegation, verbose),
            },
          ],
        };
      }
    );

    this.server.tool(
      "negotiate_task",
      "Send a negotiation message to another agent regarding a task.",
      {
        from_agent: z.string().describe("The name of the sender agent."),
        to_agent: z.string().describe("The name of the recipient agent."),
        task: z.string().describe("The task being discussed."),
        message: z.string().describe("The content of the message."),
      },
      async ({ from_agent, to_agent, task, message }) => {
        return {
          content: [
            {
              type: "text",
              text: this.negotiateTask(from_agent, to_agent, task, message),
            },
          ],
        };
      }
    );

    this.server.tool(
      "start_crew",
      "Start a CrewAI crew to perform a complex task using multiple agents.",
      {
        task: z.string().describe("The task description for the crew to execute."),
      },
      async ({ task }) => {
        return await this.startCrew(task);
      }
    );
  }

  spawnSubagent(
    role: string,
    goal: string,
    backstory: string,
    allow_delegation: boolean = false,
    verbose: boolean = true
  ): string {
    const agent: AgentConfig = { role, goal, backstory, allow_delegation, verbose };
    this.agents.push(agent);
    return `Agent '${role}' spawned successfully. Total agents: ${this.agents.length}`;
  }

  negotiateTask(
    from_agent: string,
    to_agent: string,
    task: string,
    message: string
  ): string {
    const negotiation: Message = { from_agent, to_agent, task, message };
    this.negotiations.push(negotiation);
    return `Message sent from ${from_agent} to ${to_agent}.`;
  }

  async startCrew(task: string) {
    const checkCrew = spawn("python3", ["-c", "import crewai"], {
      stdio: "ignore",
    });
    const crewInstalled = await new Promise<boolean>((resolve) => {
      checkCrew.on("exit", (code) => resolve(code === 0));
      checkCrew.on("error", () => resolve(false));
    });

    if (!crewInstalled) {
      return {
        content: [
          {
            type: "text",
            text: "Error: 'crewai' python package is not installed. Please install it using `pip install crewai`.",
          },
        ],
      };
    }

    let scriptPath: string;
    let finalTask = task;

    if (this.agents.length > 0) {
      // Generate dynamic script
      scriptPath = await this.generateCrewScript(task);
    } else {
      // Use generic script (fallback)
      scriptPath = join(
        process.cwd(),
        "src",
        "agents",
        "crewai",
        "generic_crew.py",
      );

      const soulPath = join(process.cwd(), "src", "agents", "souls", "crewai.md");
      try {
        const soul = await readFile(soulPath, "utf-8");
        finalTask = `${soul}\n\nTask:\n${task}`;
      } catch (e) {
        // console.warn("Could not load CrewAI soul:", e);
      }
    }

    // Set up environment
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const env = {
      ...process.env,
      OPENAI_API_KEY: apiKey,
      ...(process.env.DEEPSEEK_API_KEY
        ? {
          OPENAI_BASE_URL: "https://api.deepseek.com",
          OPENAI_MODEL_NAME: "deepseek-reasoner",
        }
        : {}),
    };

    return new Promise<any>((resolve, reject) => {
      // If we generated the script, the task is embedded or passed as arg.
      // The original implementation passed `finalTask` as an argument.
      // My generated script will accept the task as an argument too.

      const child = spawn("python3", [scriptPath, finalTask], {
        env,
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({
            content: [
              {
                type: "text",
                text: output || "Crew execution completed successfully.",
              },
            ],
          });
        } else {
          resolve({
            content: [
              {
                type: "text",
                text: `Crew execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
          });
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text",
              text: `Failed to spawn python process: ${err.message}`,
            },
          ],
        });
      });
    });
  }

  private async generateCrewScript(taskDescription: string): Promise<string> {
    // Create .agent/crewai directory if not exists
    const agentDir = join(process.cwd(), ".agent", "crewai");
    try {
        await mkdir(agentDir, { recursive: true });
    } catch (e) {
        // ignore if exists
    }

    const timestamp = Date.now();
    const configPath = join(agentDir, `config_${timestamp}.json`);
    await writeFile(configPath, JSON.stringify(this.agents, null, 2));

    const scriptContent = `
import sys
import json
from crewai import Agent, Task, Crew, Process

# Load configuration
with open('${configPath}', 'r') as f:
    agents_config = json.load(f)

agents = []
tasks = []

# Create Agents and Tasks
for i, config in enumerate(agents_config):
    agent = Agent(
        role=config['role'],
        goal=config['goal'],
        backstory=config['backstory'],
        allow_delegation=config.get('allow_delegation', False),
        verbose=config.get('verbose', True)
    )
    agents.append(agent)

    task = Task(
        description=f"Task for {config['role']}: {sys.argv[1]}",
        agent=agent,
        expected_output=f"Detailed report from {config['role']}"
    )
    tasks.append(task)

# Crew
crew = Crew(
    agents=agents,
    tasks=tasks,
    verbose=True,
    process=Process.sequential
)

result = crew.kickoff()
print(result)
`;

    const scriptPath = join(agentDir, `generated_crew_${timestamp}.py`);
    await writeFile(scriptPath, scriptContent);
    return scriptPath;
  }

  async handleCallTool(name: string, args: any) {
    const mcpServer = this.server as any;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CrewAI MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CrewAIServer();
  server.run().catch((err) => {
    console.error("Fatal error in CrewAI MCP Server:", err);
    process.exit(1);
  });
}
