import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { Mutex } from "async-mutex";
import { lock } from "proper-lockfile";

export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  properties: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class SemanticGraph {
  private baseDir: string;
  private cache: Map<string, GraphData> = new Map();
  private mutexes: Map<string, Mutex> = new Map();

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  private getMutex(company: string = "default"): Mutex {
      if (!this.mutexes.has(company)) {
          this.mutexes.set(company, new Mutex());
      }
      return this.mutexes.get(company)!;
  }

  private getFilePath(company?: string): string {
    if (company && !/^[a-zA-Z0-9_-]+$/.test(company)) {
      console.warn(`Invalid company name for graph: ${company}, falling back to default.`);
      return join(this.baseDir, ".agent", "brain", "graph.json");
    }
    const filename = company ? `graph_${company}.json` : "graph.json";
    return join(this.baseDir, ".agent", "brain", filename);
  }

  private async withLock<T>(company: string | undefined, action: () => Promise<T>): Promise<T> {
    const mutex = this.getMutex(company);
    return mutex.runExclusive(async () => {
        const filePath = this.getFilePath(company);

        // Ensure file exists for locking
        if (!existsSync(filePath)) {
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, JSON.stringify({ nodes: [], edges: [] }, null, 2));
        }

        let release: () => Promise<void>;
        try {
            release = await lock(filePath, {
                retries: {
                    retries: 5,
                    factor: 2,
                    minTimeout: 100,
                    maxTimeout: 1000,
                    randomize: true
                },
                stale: 5000 // 5 seconds lock expiration
            });
        } catch (e: any) {
             throw new Error(`Failed to acquire lock for graph ${company || "default"}: ${e.message}`);
        }

        try {
            return await action();
        } finally {
            await release();
        }
    });
  }

  private async load(company?: string): Promise<GraphData> {
    const key = company || "default";
    if (this.cache.has(key)) {
        return this.cache.get(key)!;
    }

    const filePath = this.getFilePath(company);
    let data: GraphData = { nodes: [], edges: [] };

    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, "utf-8");
        data = JSON.parse(content);
      } catch (e) {
        console.error(`Failed to load semantic graph for ${key}:`, e);
      }
    } else {
       // Create directory if it doesn't exist
       await mkdir(dirname(filePath), { recursive: true });
       await writeFile(filePath, JSON.stringify(data, null, 2));
    }

    this.cache.set(key, data);
    return data;
  }

  private async save(data: GraphData, company?: string) {
    const filePath = this.getFilePath(company);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(data, null, 2));
      // Update cache
      this.cache.set(company || "default", data);
    } catch (e) {
      console.error("Failed to save semantic graph:", e);
    }
  }

  async addNode(id: string, type: string, properties: Record<string, any> = {}, company?: string): Promise<void> {
    return this.withLock(company, async () => {
        const data = await this.load(company);
        const existing = data.nodes.find((n) => n.id === id);
        if (existing) {
        existing.properties = { ...existing.properties, ...properties };
        existing.type = type; // Update type if provided
        } else {
        data.nodes.push({ id, type, properties });
        }
        await this.save(data, company);
    });
  }

  async addEdge(from: string, to: string, relation: string, properties: Record<string, any> = {}, company?: string): Promise<void> {
    return this.withLock(company, async () => {
        const data = await this.load(company);
        // Check if edge exists
        const existingIndex = data.edges.findIndex(
        (e) => e.from === from && e.to === to && e.relation === relation
        );

        if (existingIndex >= 0) {
            data.edges[existingIndex].properties = { ...data.edges[existingIndex].properties, ...properties };
        } else {
        data.edges.push({ from, to, relation, properties });
        }
        await this.save(data, company);
    });
  }

  async query(query: string, company?: string): Promise<any> {
      return this.withLock(company, async () => {
          const data = await this.load(company);
          // Simple keyword search for now
          const q = query.toLowerCase();
          const nodes = data.nodes.filter(n =>
              n.id.toLowerCase().includes(q) ||
              n.type.toLowerCase().includes(q) ||
              JSON.stringify(n.properties).toLowerCase().includes(q)
          );

          const edges = data.edges.filter(e =>
            e.from.toLowerCase().includes(q) ||
            e.to.toLowerCase().includes(q) ||
            e.relation.toLowerCase().includes(q) ||
            JSON.stringify(e.properties).toLowerCase().includes(q)
          );

          return { nodes, edges };
      });
  }

  async getGraphData(company?: string): Promise<GraphData> {
    return this.withLock(company, async () => {
        return this.load(company);
    });
  }
}
