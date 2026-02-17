import { SemanticGraph } from "../../../brain/semantic_graph.js";
import { randomUUID } from "crypto";

const semanticGraph = new SemanticGraph();

export async function storeSemantic(content: string, metadata: any = {}): Promise<void> {
  const operation = metadata.operation;

  if (operation === "add_node") {
    // metadata should contain id, type, properties
    const id = metadata.id || randomUUID();
    const type = metadata.type || "fact";
    const properties = metadata.properties || {};
    // Ensure content is stored if not redundant
    if (!properties.content) {
      properties.content = content;
    }
    await semanticGraph.addNode(id, type, properties);
  } else if (operation === "add_edge") {
    // metadata should contain from, to, relation, properties
    const from = metadata.from;
    const to = metadata.to;
    const relation = metadata.relation;
    if (!from || !to || !relation) {
      throw new Error("add_edge operation requires 'from', 'to', and 'relation' in metadata.");
    }
    const properties = metadata.properties || {};
    if (content && !properties.content) {
        properties.content = content;
    }
    await semanticGraph.addEdge(from, to, relation, properties);
  } else {
    // Default behavior: Create a node representing this memory/fact
    const id = metadata.id || randomUUID();
    const type = metadata.type || "fact";
    const properties = metadata.properties || {};
    properties.content = content;

    // Merge other metadata into properties
    for (const key in metadata) {
        if (key !== "id" && key !== "type" && key !== "properties") {
            properties[key] = metadata[key];
        }
    }

    await semanticGraph.addNode(id, type, properties);
  }
}

export async function querySemantic(query: string): Promise<any> {
  return await semanticGraph.query(query);
}
