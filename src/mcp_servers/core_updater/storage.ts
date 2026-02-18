import { join, dirname } from "path";
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { CoreProposal } from "./types.js";

export class CoreProposalStorage {
  private baseDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.baseDir = join(rootDir, ".agent", "pending_updates");
  }

  async init() {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(id: string): string {
    return join(this.baseDir, `${id}.json`);
  }

  async save(proposal: CoreProposal): Promise<void> {
    await this.init();
    const path = this.getFilePath(proposal.id);
    await writeFile(path, JSON.stringify(proposal, null, 2));
  }

  async get(id: string): Promise<CoreProposal | null> {
    await this.init();
    const path = this.getFilePath(id);
    if (!existsSync(path)) return null;

    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error(`Failed to read proposal ${id}:`, e);
      return null;
    }
  }

  async list(): Promise<string[]> {
    await this.init();
    try {
      const files = await readdir(this.baseDir);
      return files.filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const path = this.getFilePath(id);
    if (existsSync(path)) {
      await unlink(path);
    }
  }
}
