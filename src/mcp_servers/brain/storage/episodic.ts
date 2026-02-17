import { EpisodicMemory } from "../../../brain/episodic.js";
import { randomUUID } from "crypto";

const episodicMemory = new EpisodicMemory();

export async function storeEpisodic(content: string, embedding?: number[], metadata: any = {}): Promise<void> {
  const taskId = metadata.taskId || randomUUID();
  const solution = metadata.solution || "";
  const artifacts = metadata.artifacts || [];

  // We treat 'content' as the 'request' or main body of the memory.
  await episodicMemory.store(taskId, content, solution, artifacts, embedding);
}

export async function queryEpisodic(query: string, limit: number): Promise<any[]> {
  return await episodicMemory.recall(query, limit);
}
