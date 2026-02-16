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
  private filePath: string;
  private data: GraphData = { nodes: [], edges: [] };

  constructor(baseDir: string = process.cwd()) {
    this.filePath = join(baseDir, ".agent", "brain", "graph.json");
    this.init();
  }

  private async init() {
    if (existsSync(this.filePath)) {
      try {
        const content = await readFile(this.filePath, "utf-8");
        this.data = JSON.parse(content);
      } catch (e) {
        console.error("Failed to load semantic graph:", e);
      }
    } else {
      await this.save();
    }
  }

  private async save() {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("Failed to save semantic graph:", e);
    }
  }

  async addNode(id: string, type: string, properties: Record<string, any> = {}): Promise<void> {
    const existing = this.data.nodes.find((n) => n.id === id);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      existing.type = type; // Update type if provided
    } else {
      this.data.nodes.push({ id, type, properties });
    }
    await this.save();
  }

  async addEdge(from: string, to: string, relation: string, properties: Record<string, any> = {}): Promise<void> {
    // Check if edge exists
    const existingIndex = this.data.edges.findIndex(
      (e) => e.from === from && e.to === to && e.relation === relation
    );

    if (existingIndex >= 0) {
        this.data.edges[existingIndex].properties = { ...this.data.edges[existingIndex].properties, ...properties };
    } else {
      this.data.edges.push({ from, to, relation, properties });
    }
    await this.save();
  }

  async query(query: string): Promise<any> {
      // Simple keyword search for now
      const q = query.toLowerCase();
      const nodes = this.data.nodes.filter(n =>
          n.id.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q) ||
          JSON.stringify(n.properties).toLowerCase().includes(q)
      );

      const edges = this.data.edges.filter(e =>
        e.from.toLowerCase().includes(q) ||
        e.to.toLowerCase().includes(q) ||
        e.relation.toLowerCase().includes(q) ||
        JSON.stringify(e.properties).toLowerCase().includes(q)
      );

      return { nodes, edges };
  }

  getGraphData(): GraphData {
    return this.data;
  }
}
