import { join } from "path";
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { CoreProposal } from "./types.js";

export class CoreProposalStorage {
  private baseDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.baseDir = join(rootDir, ".agent", "pending_core_updates");
  }

  async init() {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  // Generate filename: {timestamp}_{id}.json
  private getFilePath(id: string, timestamp: number): string {
    return join(this.baseDir, `${timestamp}_${id}.json`);
  }

  // Find file path by ID (since timestamp might be unknown when getting by ID)
  private async findFilePathById(id: string): Promise<string | null> {
    await this.init();
    const files = await readdir(this.baseDir);
    const file = files.find(f => f.endsWith(`_${id}.json`));
    return file ? join(this.baseDir, file) : null;
  }

  async save(proposal: CoreProposal): Promise<void> {
    await this.init();
    const path = this.getFilePath(proposal.id, proposal.createdAt);
    await writeFile(path, JSON.stringify(proposal, null, 2));
  }

  async get(id: string): Promise<CoreProposal | null> {
    const path = await this.findFilePathById(id);
    if (!path) return null;

    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error(`Failed to read proposal ${id}:`, e);
      return null;
    }
  }

  async list(): Promise<CoreProposal[]> {
    await this.init();
    try {
      const files = await readdir(this.baseDir);
      const proposals: CoreProposal[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(this.baseDir, file), "utf-8");
          proposals.push(JSON.parse(content));
        } catch {
          // Ignore malformed files
        }
      }
      return proposals.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const path = await this.findFilePathById(id);
    if (path) {
      await unlink(path);
    }
  }
}
