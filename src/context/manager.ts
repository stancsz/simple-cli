export interface Tool {
  name: string;
  execute: (args: any, options?: any) => Promise<any>;
}

export interface ToolRegistry {
  tools: Map<string, Tool>;
}

export class ContextManager {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async recallSimilar(prompt: string, limit: number = 3): Promise<string | null> {
    try {
      const brain = this.getBrainTool("query_memory");
      if (!brain) return null;

      const result: any = await brain.execute({ query: prompt, limit });
      // Result is likely { content: [{ type: "text", text: "..." }] }
      if (result && result.content && Array.isArray(result.content) && result.content.length > 0) {
        return result.content[0].text;
      } else if (typeof result === 'string') {
          return result;
      }
      return null;
    } catch (e) {
      console.warn("Failed to recall memory:", e);
      return null;
    }
  }

  async storeMemory(userPrompt: string, agentResponse: string, artifacts: string[]): Promise<void> {
    try {
      const brain = this.getBrainTool("store_memory");
      if (!brain) return;

      await brain.execute({
        userPrompt,
        agentResponse,
        artifacts: JSON.stringify(artifacts),
      });
    } catch (e) {
      console.warn("Failed to store memory:", e);
    }
  }

  private getBrainTool(name: string): Tool | undefined {
    return this.registry.tools.get(name);
  }
}
