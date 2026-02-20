import { CompanyManager } from "../company_context/manager.js";
import { MCP } from "../mcp.js";

export class CompanyLoader {
  constructor(private mcp: MCP) {}

  async load(company: string) {
    if (!company) return;

    // Load company data (Brand Voice, Docs) from .agent/brain/companies/{company}
    const companyManager = new CompanyManager(company);
    await companyManager.load();
    const companyContext = await companyManager.getContext();

    // Update ContextManager via MCP
    const client = this.mcp.getClient("context_server");
    if (!client) {
      console.warn("Context server not available for CompanyLoader update.");
      return;
    }

    try {
      await client.callTool({
        name: "update_context",
        arguments: {
          updates: JSON.stringify({ company_context: companyContext }),
          company: company
        }
      });
    } catch (e) {
      console.warn("Failed to update company context via MCP:", e);
    }
  }
}
