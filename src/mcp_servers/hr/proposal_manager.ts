import { join, dirname } from "path";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { Proposal, ProposalStatus } from "./types.js";

export class ProposalManager {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = join(baseDir, ".agent", "hr", "proposals");
  }

  async init() {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(id: string): string {
    return join(this.baseDir, `${id}.json`);
  }

  async add(proposal: Proposal): Promise<void> {
    await this.init();
    const filePath = this.getFilePath(proposal.id);
    await writeFile(filePath, JSON.stringify(proposal, null, 2));
  }

  async get(id: string): Promise<Proposal | undefined> {
    const filePath = this.getFilePath(id);
    if (!existsSync(filePath)) return undefined;
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error(`Failed to read proposal ${id}:`, e);
      return undefined;
    }
  }

  async getAll(): Promise<Proposal[]> {
    await this.init();
    const files = await readdir(this.baseDir);
    const proposals: Proposal[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "");
        const p = await this.get(id);
        if (p) proposals.push(p);
      }
    }
    return proposals;
  }

  async getPending(): Promise<Proposal[]> {
    const all = await this.getAll();
    return all.filter(p => p.status === 'pending');
  }

  async update(id: string, updates: Partial<Proposal>): Promise<Proposal | undefined> {
    const p = await this.get(id);
    if (!p) return undefined;

    const updated = { ...p, ...updates, updatedAt: Date.now() };
    await this.add(updated);
    return updated;
  }

  async updateStatus(id: string, status: ProposalStatus): Promise<Proposal | undefined> {
    return this.update(id, { status });
  }
}
