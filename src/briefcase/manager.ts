import { CompanyStore } from "./store.js";
import { CompanyProfile, Document } from "./types.js";
import { createLLM } from "../llm.js";

export class CompanyManager {
  private store: CompanyStore;
  private profile: CompanyProfile | null = null;

  constructor(company: string, llm?: ReturnType<typeof createLLM>) {
    this.store = new CompanyStore(company, llm);
  }

  async load() {
    this.profile = await this.store.loadProfile();
  }

  async getContext(query: string): Promise<string> {
    if (!this.profile) await this.load();

    let context = `## Company Profile: ${this.profile?.name}\n`;
    if (this.profile?.brandVoice) {
        context += `### Brand Voice\n${this.profile.brandVoice}\n`;
    }

    if (query) {
        const docs = await this.store.searchDocuments(query);
        if (docs.length > 0) {
            context += `\n### Relevant Internal Documents\n`;
            docs.forEach(doc => {
                context += `- **${doc.id}**: ${doc.text.substring(0, 500)}...\n`;
            });
        }
    }

    return context;
  }

  async addDocument(title: string, content: string) {
      await this.store.addDocument(title, content);

      // Update profile internalDocs list
      if (!this.profile) await this.load();
      if (!this.profile!.internalDocs) this.profile!.internalDocs = [];
      if (!this.profile!.internalDocs.includes(title)) {
          this.profile!.internalDocs.push(title);
          await this.store.saveProfile(this.profile!);
      }
  }

  async updateProfile(updates: Partial<CompanyProfile>) {
      if (!this.profile) await this.load();
      this.profile = { ...this.profile!, ...updates };
      await this.store.saveProfile(this.profile!);
  }

  async listDocuments() {
      if (!this.profile) await this.load();
      return this.profile?.internalDocs || [];
  }
}
