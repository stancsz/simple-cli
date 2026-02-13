import { readFile, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface Learning {
  id: string;
  task: string;
  reflection: string;
  timestamp: number;
}

export class LearningManager {
  private learnings: Learning[] = [];
  private path: string;

  constructor(cwd: string) {
    const agentDir = join(cwd, ".agent");
    if (!existsSync(agentDir)) {
      try {
        mkdirSync(agentDir, { recursive: true });
      } catch {}
    }
    this.path = join(agentDir, "learnings.json");
  }

  async load() {
    if (!existsSync(this.path)) return;
    try {
      const data = await readFile(this.path, "utf-8");
      this.learnings = JSON.parse(data);
    } catch {
      this.learnings = [];
    }
  }

  async save() {
    await writeFile(this.path, JSON.stringify(this.learnings, null, 2));
  }

  async add(task: string, reflection: string) {
    this.learnings.push({
      id: Date.now().toString(),
      task,
      reflection,
      timestamp: Date.now(),
    });
    await this.save();
  }

  async search(query: string): Promise<string[]> {
    if (!query) return [];
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (keywords.length === 0) return [];

    return this.learnings
      .filter((l) => {
        const text = (l.task + " " + l.reflection).toLowerCase();
        return keywords.some((k) => text.includes(k));
      })
      .map((l) => l.reflection)
      .slice(0, 5);
  }
}
