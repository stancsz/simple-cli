import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../brain/episodic.js";
import { dirname } from "path";

// Ensure we use mock embeddings for the tutorial to avoid API keys
process.env.MOCK_EMBEDDINGS = "true";

export class TutorialServer {
  private server: McpServer;
  private episodic: EpisodicMemory;
  private company: string;

  constructor() {
    this.server = new McpServer({
      name: "tutorial-server",
      version: "1.0.0",
    });

    const baseDir = process.cwd(); // Assume running from repo root
    this.episodic = new EpisodicMemory(baseDir);
    this.company = process.env.JULES_COMPANY || "quick_start_demo";

    this.setupTools();
  }

  private async logExperience(taskId: string, request: string, solution: string, artifacts: string[]) {
      try {
          await this.episodic.store(
              taskId,
              request,
              solution,
              artifacts,
              this.company,
              undefined, // simulation_attempts
              false,     // resolved_via_dreaming
              undefined, // dreaming_outcomes
              undefined, // id
              Math.floor(Math.random() * 1000) + 100, // Random tokens
              Math.floor(Math.random() * 5000) + 1000 // Random duration
          );
      } catch (e: any) {
          console.error(`[TutorialServer] Failed to log experience: ${e.message}`);
      }
  }

  private setupTools() {
    // --- Aider Tool ---
    this.server.tool(
      "aider_chat",
      "Chat with Aider about your code or ask it to make edits.",
      {
        message: z.string().describe("The message or instruction for Aider."),
        files: z.array(z.string()).optional().describe("List of file paths to include in the context."),
      },
      async ({ message, files }) => {
        // Simulate Aider work
        const taskId = `aider-${Date.now()}`;
        const solution = `[Aider Simulation] I have analyzed the request: "${message}".\n\nI found the issue in the provided files. Applying fix...\n\nDone.`;

        await this.logExperience(taskId, `User: ${message}`, solution, files || []);

        return {
          content: [{ type: "text", text: solution }],
        };
      }
    );

    // --- CrewAI Tool ---
    this.server.tool(
      "start_crew",
      "Start a CrewAI crew to perform a complex task using multiple agents.",
      {
        task: z.string().describe("The task description for the crew to execute."),
      },
      async ({ task }) => {
        // Simulate CrewAI work
        const taskId = `crew-${Date.now()}`;
        const solution = `[CrewAI Simulation] Crew started with task: "${task}".\n\nAgent 'Researcher' found relevant data.\nAgent 'Analyst' synthesized the findings.\n\nFinal Report: The future of AI agents is promising, with a focus on multi-agent collaboration.`;

        await this.logExperience(taskId, `User Task: ${task}`, solution, []);

        return {
          content: [{ type: "text", text: solution }],
        };
      }
    );

    // --- v0.dev Tool ---
    this.server.tool(
      "v0dev_generate_component",
      "Generate a UI component using v0.dev based on a text description.",
      {
        prompt: z.string().describe("Description of the UI component to generate."),
        framework: z.enum(["react", "vue", "html"]).optional().describe("Target framework (default: react)."),
      },
      async ({ prompt, framework }) => {
        // Simulate v0.dev work
        const taskId = `v0-${Date.now()}`;
        const solution = `[v0.dev Simulation] Generating UI for: "${prompt}" (${framework || "react"})...\n\nComponent created successfully.\nPreview URL: https://v0.dev/p/simulated-id\n\nCode:\nexport default function Component() { return <div>Generated UI</div> }`;

        await this.logExperience(taskId, `User Prompt: ${prompt}`, solution, []);

        return {
          content: [{ type: "text", text: solution }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Tutorial MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new TutorialServer();
  server.run().catch((err) => {
    console.error("Fatal error in Tutorial MCP Server:", err);
    process.exit(1);
  });
}
