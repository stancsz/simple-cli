import { Registry } from "../engine/orchestrator.js";
import { LLM } from "../llm.js";
import { SOPRegistry } from "../workflows/sop_registry.js";
import { MCP } from "../mcp.js";
import { z } from "zod";

export class Briefcase {
  constructor(
    private registry: Registry,
    private llm: LLM,
    private sopRegistry: SOPRegistry,
    private mcp: MCP
  ) {}

  async switchCompany(company: string) {
    // Validate company name to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(company)) {
        throw new Error("Invalid company name. Only alphanumeric characters, hyphens, and underscores are allowed.");
    }

    // 1. Set environment variable
    process.env.JULES_COMPANY = company;

    // 2. Update Persona Engine
    if (this.llm.personaEngine) {
        this.llm.personaEngine.setCompany(company);
    }

    // 3. Update SOP Registry
    this.sopRegistry.setCompany(company);

    // 4. Load Company Tools
    await this.registry.loadCompanyTools(company);

    // 5. Restart context server if running
    if (this.mcp.isServerRunning("context")) {
        await this.mcp.stopServer("context");
        // We need to wait a bit or ensure it's stopped before starting?
        // stopServer awaits close() so it should be fine.
        try {
            await this.mcp.startServer("context");
        } catch (e) {
            console.warn(`Failed to restart context server for company ${company}:`, e);
        }
    }

    return `Switched to company: ${company}. Loaded persona, workflows, and tools.`;
  }
}

export function createSwitchCompanyTool(briefcase: Briefcase) {
  return {
    name: "switch_company",
    description: "Switch the active context to a specific company.",
    inputSchema: z.object({
      company: z.string().describe("The name of the company/client (e.g. 'client-a')."),
    }),
    execute: async ({ company }: { company: string }) => {
      return await briefcase.switchCompany(company);
    },
  };
}
