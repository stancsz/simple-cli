import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { Proposal, ProposalStatus } from "./types.js";

export class ProposalStorage {
  private filePath: string;
  private proposals: Map<string, Proposal> = new Map();

  constructor(baseDir: string = process.cwd()) {
    this.filePath = join(baseDir, ".agent", "hr", "proposals.json");
  }

  async init() {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (existsSync(this.filePath)) {
      try {
        const content = await readFile(this.filePath, "utf-8");
        const list: Proposal[] = JSON.parse(content);
        list.forEach(p => this.proposals.set(p.id, p));
      } catch (e) {
        console.error("Failed to load proposals:", e);
        // Start fresh on error
        this.proposals.clear();
      }
    } else {
        // Initialize empty file
        await this.save();
    }
  }

  async save() {
    const list = Array.from(this.proposals.values());
    await writeFile(this.filePath, JSON.stringify(list, null, 2));
  }

  async add(proposal: Proposal): Promise<void> {
    this.proposals.set(proposal.id, proposal);
    await this.save();
  }

  get(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  getAll(): Proposal[] {
    return Array.from(this.proposals.values());
  }

  getPending(): Proposal[] {
    return this.getAll().filter(p => p.status === 'pending');
  }

  async update(id: string, updates: Partial<Proposal>): Promise<Proposal | undefined> {
    const p = this.proposals.get(id);
    if (!p) return undefined;

    const updated = { ...p, ...updates, updatedAt: Date.now() };
    this.proposals.set(id, updated);
    await this.save();
    return updated;
  }
}
