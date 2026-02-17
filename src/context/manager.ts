import { ContextManager, ContextData, ContextSchema } from "../core/context.js";
import { EpisodicMemory } from "../brain/episodic.js";
import { z } from "zod";

// Deep merge helper
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return source;

  const output = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    }
  }
  return output;
}

export class BrainContextManager implements ContextManager {
  private episodic: EpisodicMemory;
  private company: string | undefined;

  constructor(episodic?: EpisodicMemory) {
    this.episodic = episodic || new EpisodicMemory();
    this.company = process.env.JULES_COMPANY;
  }

  private async getLatestContext(): Promise<ContextData | null> {
    // Retrieve the latest context snapshot
    // Using taskId = 'context_snapshot' to filter.
    const episodes = await this.episodic.retrieveLatest(1, this.company, "taskId = 'context_snapshot'");

    if (episodes.length === 0) return null;

    const snapshot = episodes[0];
    try {
      // The context JSON is stored in agentResponse (solution)
      const parsed = JSON.parse(snapshot.agentResponse);
      const result = ContextSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      } else {
        console.warn("Context snapshot schema mismatch, attempting partial recovery:", result.error);
        // Return whatever matches, or empty if totally broken.
        // Note: zod .parse will throw if validation fails and no defaults cover it.
        // But since we use defaults for arrays and optionals for strings, it should be robust.
        return ContextSchema.parse(parsed);
      }
    } catch (e) {
      console.warn("Failed to parse context snapshot JSON:", e);
      return null;
    }
  }

  async readContext(lockId?: string): Promise<ContextData> {
    let context = await this.getLatestContext();
    if (!context) {
      // If no context exists, return empty default
      context = ContextSchema.parse({});
    }

    // Load relevant past decisions if goals exist
    // This implements "relevant past decisions" requirement
    if (context.goals && context.goals.length > 0) {
      try {
        const query = `relevant to goals: ${context.goals.join(", ")}`;
        // Recall relevant memories
        const memories = await this.episodic.recall(query, 5, this.company);

        if (memories.length > 0) {
          const summary = memories
            .filter(m => m.taskId !== 'context_snapshot') // Exclude snapshots themselves
            .map(m => `[${new Date(m.timestamp).toISOString()}] Task: ${m.taskId}\nRequest: ${m.userPrompt}\nSolution: ${m.agentResponse}`)
            .join("\n\n");

          if (summary) {
             const existing = context.working_memory ? `\n\n${context.working_memory}` : "";
             context.working_memory = `--- Relevant Memories (Auto-Loaded) ---\n${summary}${existing}`;
          }
        }
      } catch (e) {
        console.warn("Failed to recall relevant memories for context:", e);
      }
    }

    return context;
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    const current = await this.getLatestContext() || ContextSchema.parse({});
    const merged = deepMerge(current, updates);

    // Validate
    const parsed = ContextSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`Invalid context update: ${parsed.error.message}`);
    }

    const finalContext = parsed.data;
    finalContext.last_updated = new Date().toISOString();

    // Store in Brain as a snapshot
    await this.episodic.store(
      "context_snapshot",
      "Context Snapshot Update",
      JSON.stringify(finalContext),
      ["context.json"],
      this.company
    );

    return finalContext;
  }

  async clearContext(lockId?: string): Promise<void> {
    const empty = ContextSchema.parse({});
    await this.episodic.store(
      "context_snapshot",
      "Context Snapshot (Cleared)",
      JSON.stringify(empty),
      ["context.json"],
      this.company
    );
  }
}
