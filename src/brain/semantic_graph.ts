import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

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
  private company?: string;

  constructor(baseDir: string = process.cwd(), company?: string) {
    this.baseDir = baseDir;
    this.company = company;
  }

  private getFilePath(companyOverride?: string): string {
    const company = this.company || companyOverride;

    if (company) {
      if (!/^[a-zA-Z0-9_-]+$/.test(company)) {
        console.warn(`Invalid company name for graph: ${company}, falling back to default.`);
        return join(this.baseDir, ".agent", "brain", "graph.json");
      }
      return join(this.baseDir, ".agent", "brain", "companies", company, "graph_db", "graph.json");
    }
    return join(this.baseDir, ".agent", "brain", "graph.json");
  }

  private async load(companyOverride?: string): Promise<GraphData> {
    const company = this.company || companyOverride;
    const key = company || "default";

    if (this.cache.has(key)) {
        return this.cache.get(key)!;
    }

    const filePath = this.getFilePath(companyOverride);
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

  private async save(data: GraphData, companyOverride?: string) {
    const company = this.company || companyOverride;
    const filePath = this.getFilePath(companyOverride);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(data, null, 2));
      // Update cache
      this.cache.set(company || "default", data);
    } catch (e) {
      console.error("Failed to save semantic graph:", e);
    }
  }

  async addNode(id: string, type: string, properties: Record<string, any> = {}, companyOverride?: string): Promise<void> {
    const data = await this.load(companyOverride);
    const existing = data.nodes.find((n) => n.id === id);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      existing.type = type; // Update type if provided
    } else {
      data.nodes.push({ id, type, properties });
    }
    await this.save(data, companyOverride);
  }

  async addEdge(from: string, to: string, relation: string, properties: Record<string, any> = {}, companyOverride?: string): Promise<void> {
    const data = await this.load(companyOverride);
    // Check if edge exists
    const existingIndex = data.edges.findIndex(
      (e) => e.from === from && e.to === to && e.relation === relation
    );

    if (existingIndex >= 0) {
        data.edges[existingIndex].properties = { ...data.edges[existingIndex].properties, ...properties };
    } else {
      data.edges.push({ from, to, relation, properties });
    }
    await this.save(data, companyOverride);
  }

  async query(query: string, companyOverride?: string): Promise<any> {
      const data = await this.load(companyOverride);
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
  }

  async getGraphData(companyOverride?: string): Promise<GraphData> {
    return this.load(companyOverride);
  }
}
