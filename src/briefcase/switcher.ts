import { MCP } from "../mcp.js";
import { Registry } from "../engine/orchestrator.js";
import { z } from "zod";

export class BriefcaseSwitcher {
  constructor(
    private mcp: MCP,
    private registry: Registry
  ) {}

  async switchCompany(company: string) {
    // Validate company name
    if (!/^[a-zA-Z0-9_-]+$/.test(company)) {
        throw new Error("Invalid company name. Only alphanumeric characters, hyphens, and underscores are allowed.");
    }

    // 1. Set environment variable
    process.env.JULES_COMPANY = company;
    console.log(`[Briefcase] Switching to company: ${company}`);

    // 2. Restart Briefcase MCP Server
    if (this.mcp.isServerRunning("briefcase")) {
        await this.mcp.stopServer("briefcase");
    }
    try {
        await this.mcp.startServer("briefcase");
    } catch (e: any) {
        console.warn(`Failed to start briefcase server for ${company}: ${e.message}`);
    }

    // 3. Restart Context Server (if it depends on company)
    if (this.mcp.isServerRunning("context_server")) {
        await this.mcp.stopServer("context_server");
        try {
            await this.mcp.startServer("context_server");
        } catch (e) {
             // ignore
        }
    }

    // 4. Load Company-specific Tools (if any exist in .agent/companies/<company>/tools)
    // Legacy support, or maybe we move this to Briefcase MCP?
    // For now, let's assume Briefcase MCP handles most things, but if there are local scripts...
    await this.registry.loadCompanyTools(company);

    return `Switched to company: ${company}. Context loaded.`;
  }
}

export function createSwitchCompanyTool(switcher: BriefcaseSwitcher) {
  return {
    name: "switch_company",
    description: "Switch the active context to a specific company.",
    inputSchema: z.object({
      company: z.string().describe("The name of the company/client (e.g. 'client-a')."),
    }),
    execute: async ({ company }: { company: string }) => {
      return await switcher.switchCompany(company);
    },
  };
}
