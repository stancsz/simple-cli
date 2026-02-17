import { CompanyManager } from "../company_context/manager.js";
import { ContextServer } from "../mcp_servers/context_server.js";

export class CompanyLoader {
  async load(company: string) {
    if (!company) return;

    // Load company data (Brand Voice, Docs) from .agent/brain/companies/{company}
    const companyManager = new CompanyManager(company);
    await companyManager.load();
    const companyContext = await companyManager.getContext();

    // Update ContextManager
    const contextServer = new ContextServer();
    try {
      await contextServer.updateContext({ company_context: companyContext });
    } catch (e) {
      console.warn("Failed to update company context in ContextManager:", e);
    }
  }
}
