import { ContextServer } from "../mcp_servers/context_server.js";
import { loadCompanyProfile } from "./company-profile.js";

export class CompanyLoader {
  async load(company: string) {
    if (!company) return;

    // Load company data (Brand Voice, Docs) from .agent/companies/{company}.json
    const profile = await loadCompanyProfile(company);
    if (!profile) {
        console.warn(`Company profile not found for ${company}.`);
        return;
    }

    const voice = profile.brandVoice || "No specific brand voice defined.";
    const docs = profile.internalDocs && profile.internalDocs.length > 0 ? `\n\n## Relevant Documents\n${profile.internalDocs.join(", ")}` : "";

    // Construct context string
    const companyContext = `## Company Context: ${profile.name || company}\n\n### Brand Voice\n${voice}${docs}`;

    // Update ContextManager (local file context.json)
    const contextServer = new ContextServer();
    try {
      await contextServer.updateContext({ company_context: companyContext }, undefined, company);
    } catch (e) {
      console.warn("Failed to update company context in ContextManager:", e);
    }
  }
}
