import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory, PastEpisode } from "../../../brain/episodic.js";
import { randomUUID } from "crypto";

export function registerCollectiveLearningTools(server: McpServer, episodic: EpisodicMemory) {
  server.tool(
    "sync_patterns_to_agency",
    "Pushes successful SOPs / patterns to a specified agency's episodic memory (or a shared namespace).",
    {
      target_agency: z.string().describe("The name of the agency to push patterns to (used as company/namespace)."),
      patterns: z.array(z.object({
        id: z.string().describe("The original memory/pattern ID."),
        taskId: z.string().describe("The original task ID."),
        request: z.string().describe("The user's original request or context."),
        solution: z.string().describe("The pattern/solution string."),
        type: z.string().describe("The pattern type (e.g. 'shared_sop', 'negotiation_pattern').").optional(),
      })).describe("The array of patterns to sync."),
    },
    async ({ target_agency, patterns }) => {
      try {
        let syncedCount = 0;
        for (const pattern of patterns) {
          // Store it directly into the target agency's namespace
          await episodic.store(
            pattern.taskId,
            pattern.request,
            pattern.solution,
            [], // artifacts
            target_agency,
            undefined, // simulation_attempts
            undefined, // resolved_via_dreaming
            undefined, // dreaming_outcomes
            `shared_${pattern.id}`, // prefix ID to avoid collisions
            undefined, // tokens
            undefined, // duration
            pattern.type || "shared_pattern",
            pattern.id // store original ID as related
          );
          syncedCount++;
        }
        return {
          content: [{ type: "text", text: `Successfully synced ${syncedCount} patterns to ${target_agency}.` }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to sync patterns: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "fetch_shared_patterns",
    "Retrieves patterns broadcasted to a shared namespace.",
    {
      source_agency: z.string().describe("The name of the agency to fetch patterns from (used as company/namespace)."),
      query: z.string().describe("The topic or task to query for patterns."),
      limit: z.number().optional().describe("Max number of patterns to return. Defaults to 5."),
    },
    async ({ source_agency, query, limit }) => {
      try {
        const results = await episodic.recall(query, limit || 5, source_agency);
        // Filter out those that are not patterns (although we synced them with type='shared_pattern' or similar, recall returns them).
        // Let's just return what recall found.
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to fetch patterns: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "merge_shared_sops",
    "Merges retrieved patterns into the local agency's episodic memory, using a lightweight conflict resolution (timestamp-based 'latest wins').",
    {
      local_agency: z.string().describe("The local agency name to merge into (used as company/namespace)."),
      patterns: z.array(z.object({
        id: z.string().describe("The fetched pattern ID."),
        taskId: z.string().describe("The fetched task ID."),
        request: z.string().describe("The fetched request/context."),
        solution: z.string().describe("The fetched solution/pattern string."),
        timestamp: z.number().describe("The timestamp of the fetched pattern."),
        type: z.string().optional().describe("The pattern type."),
        related_episode_id: z.string().optional(),
      })).describe("The array of fetched patterns to merge."),
    },
    async ({ local_agency, patterns }) => {
      try {
        let mergedCount = 0;
        let skippedCount = 0;

        // Implementation with timestamp-based latest wins:
        for (const pattern of patterns) {
          // Check if we already have this pattern locally by searching for its exact ID
          // Since we might not have a direct findById, we can search and filter.
          // Or more simply, since EpisodicMemory.store deletes by ID before inserting,
          // we can check recent episodes. For a robust check, let's use recall and filter by ID.
          const existing = await episodic.recall(pattern.request || pattern.taskId, 10, local_agency);
          const localMatch = existing.find((e: any) => e.id === pattern.id);

          if (localMatch && localMatch.timestamp && localMatch.timestamp >= pattern.timestamp) {
            skippedCount++;
            continue; // Local is newer or same, skip
          }

          // Otherwise, local is older or doesn't exist. Overwrite it.
          await episodic.store(
            pattern.taskId,
            pattern.request,
            pattern.solution,
            [], // artifacts
            local_agency,
            undefined, // simulation_attempts
            undefined, // resolved_via_dreaming
            undefined, // dreaming_outcomes
            pattern.id, // maintain the same ID so it overwrites if it exists
            undefined, // tokens
            undefined, // duration
            pattern.type || "merged_pattern",
            pattern.related_episode_id
          );
          mergedCount++;
        }

        return {
          content: [{ type: "text", text: `Successfully merged ${mergedCount} patterns into ${local_agency} memory.` }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to merge shared SOPs: ${e.message}` }],
          isError: true,
        };
      }
    }
  );
}
