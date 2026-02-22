import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { JsonVectorStore, VectorStore } from "./vector_store.js";

export interface CompanyConfig {
  name: string;
  brand_voice: string;
  [key: string]: any;
}

export class CompanyManager {
  private config: CompanyConfig | null = null;
  private vectorStore: VectorStore;
  private companyId: string | null = null;
  private loaded: boolean = false;

  constructor(companyId?: string) {
    this.companyId = companyId || null;
    this.vectorStore = new JsonVectorStore();
  }

  async load(): Promise<void> {
    if (!this.companyId || this.loaded) return;

    const baseDir = join(process.cwd(), ".agent", "companies", this.companyId);

    // 1. Load Config
    const configPath = join(baseDir, "config", "company_context.json");
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        this.config = JSON.parse(content);
      } catch (e) {
        console.error(`Failed to load company config for ${this.companyId}:`, e);
      }
    }

    // 2. Load Docs
    const docsDir = join(baseDir, "docs");
    if (existsSync(docsDir)) {
      try {
        const files = await readdir(docsDir);
        for (const file of files) {
          if (file.endsWith(".md") || file.endsWith(".txt")) {
            const filePath = join(docsDir, file);
            const content = await readFile(filePath, "utf-8");
            await this.vectorStore.add({
              id: file,
              text: content,
              metadata: { source: filePath }
            });
          }
        }
      } catch (e) {
        console.error(`Failed to load docs for ${this.companyId}:`, e);
      }
    }

    this.loaded = true;
  }

  getBrandVoice(): string {
    return this.config?.brand_voice || "No specific brand voice defined.";
  }

  getConfig(): CompanyConfig | null {
    return this.config;
  }

  async searchDocs(query: string, limit: number = 3): Promise<string[]> {
    const results = await this.vectorStore.search(query, limit);
    return results.map(doc => `[Source: ${doc.id}]\n${doc.text}`);
  }

  async getContext(query: string = ""): Promise<string> {
    if (!this.loaded) await this.load();
    if (!this.companyId) return "No company context active.";

    const voice = this.getBrandVoice();
    let docs = "";

    if (query) {
      const results = await this.searchDocs(query);
      if (results.length > 0) {
        docs = "\n\n## Relevant Documents\n" + results.join("\n\n---\n\n");
      }
    }

    return `## Company Context: ${this.config?.name || this.companyId}\n\n### Brand Voice\n${voice}${docs}`;
  }
}
