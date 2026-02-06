import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface Pattern {
  id: string;
  content: string;
  category: string;
  timestamp: number;
  tags: string[];
}

export interface KnowledgeDB {
  patterns: Pattern[];
}

export class KnowledgeBase {
  private dbPath: string;
  private db: KnowledgeDB = { patterns: [] };
  private loaded = false;

  constructor(cwd: string) {
    this.dbPath = join(cwd, '.simple', 'knowledge.db');
  }

  private async ensureLoaded() {
    if (this.loaded) return;

    if (existsSync(this.dbPath)) {
      try {
        const content = await readFile(this.dbPath, 'utf-8');
        this.db = JSON.parse(content);
      } catch (error) {
        // Init empty if corrupt or parse error
        this.db = { patterns: [] };
      }
    }
    this.loaded = true;
  }

  private async save() {
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  async addPattern(content: string, category: string = 'general', tags: string[] = []): Promise<Pattern> {
    await this.ensureLoaded();

    const pattern: Pattern = {
      id: Math.random().toString(36).substring(2, 11),
      content,
      category,
      timestamp: Date.now(),
      tags
    };

    this.db.patterns.push(pattern);
    await this.save();
    return pattern;
  }

  async getPatterns(query?: string): Promise<Pattern[]> {
    await this.ensureLoaded();

    if (!query) return this.db.patterns;

    const lowerQuery = query.toLowerCase();
    return this.db.patterns.filter(p =>
      p.content.toLowerCase().includes(lowerQuery) ||
      p.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
      p.category.toLowerCase().includes(lowerQuery)
    );
  }

  async getAllPatterns(): Promise<Pattern[]> {
    await this.ensureLoaded();
    return this.db.patterns;
  }
}
