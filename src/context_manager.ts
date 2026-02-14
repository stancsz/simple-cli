import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

export interface ContextData {
  goals: string[];
  constraints: string[];
  recent_changes: string[];
}

export class ContextManager {
  private contextFile: string;
  private data: ContextData = {
    goals: [],
    constraints: [],
    recent_changes: [],
  };

  constructor(cwd: string = process.cwd()) {
    this.contextFile = join(cwd, ".agent", "context.json");
  }

  async loadContext(): Promise<void> {
    if (existsSync(this.contextFile)) {
      try {
        const content = await readFile(this.contextFile, "utf-8");
        this.data = JSON.parse(content);
      } catch (e) {
        console.error("Failed to load context:", e);
      }
    }
  }

  async saveContext(): Promise<void> {
    try {
      await mkdir(dirname(this.contextFile), { recursive: true });
      await writeFile(this.contextFile, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("Failed to save context:", e);
    }
  }

  async addGoal(goal: string): Promise<void> {
    await this.loadContext();
    if (!this.data.goals.includes(goal)) {
      this.data.goals.push(goal);
      await this.saveContext();
    }
  }

  async addConstraint(constraint: string): Promise<void> {
    await this.loadContext();
    if (!this.data.constraints.includes(constraint)) {
      this.data.constraints.push(constraint);
      await this.saveContext();
    }
  }

  async logChange(change: string): Promise<void> {
    await this.loadContext();
    this.data.recent_changes.push(change);
    // Keep only last 10 changes
    if (this.data.recent_changes.length > 10) {
      this.data.recent_changes = this.data.recent_changes.slice(-10);
    }
    await this.saveContext();
  }

  async getContextSummary(): Promise<string> {
    await this.loadContext();
    const parts: string[] = [];

    if (this.data.goals.length > 0) {
      parts.push("## Current Goals\n" + this.data.goals.map(g => `- ${g}`).join("\n"));
    }

    if (this.data.constraints.length > 0) {
      parts.push("## Constraints & Guidelines\n" + this.data.constraints.map(c => `- ${c}`).join("\n"));
    }

    if (this.data.recent_changes.length > 0) {
      parts.push("## Recent Architectural Changes\n" + this.data.recent_changes.map(c => `- ${c}`).join("\n"));
    }

    return parts.join("\n\n");
  }

  getContextData(): ContextData {
    return this.data;
  }
}
