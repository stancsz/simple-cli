import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyEcosystemInsights } from "../../../src/mcp_servers/agency_orchestrator/tools/apply_ecosystem_insights.js";
import { EpisodicMemory } from "../../../src/brain/episodic.js";

// Mock EpisodicMemory
const mockMemoryStore: Record<string, any> = {};

vi.mock("../../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() {}
      async store(taskId: string, request: string, solution: string, tags: string[], namespace: string, simAttempts?: any, resolved_via_dreaming?: any, dreaming_outcomes?: any, id?: string, tokens?: any, duration?: any, type?: string) {
        const storedId = id || taskId;
        mockMemoryStore[storedId] = { id: storedId, request, solution, tags, namespace, type };
        (global as any).mockBrainStoreCall({ taskId: storedId, artifacts: solution });
        return true;
      }
      async recall(topic: string, limit: number, namespace: string, type?: string) {
        if (topic === "ecosystem_policy") {
            return [{ id: "eco_1", solution: "A new policy was generated.", agentResponse: "A new policy was generated.", type: "ecosystem_policy" }];
        }
        if (topic === "swarm_config:agency_1") {
            return [{ id: "swarm_config:agency_1", solution: JSON.stringify({ current_param: 1, scaling_threshold: 0.5 }) }];
        }
        if (topic === "agency_spawning") {
            return [{ id: "spawn_1", tags: ["agency_1", "agency_spawning"] }];
        }
        return [];
      }
    }
  };
});

// Mock the LLM to return a parsed policy
vi.mock("../../../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: vi.fn().mockResolvedValue({
        message: JSON.stringify({
          target_agencies: "all",
          parameters: {
            scaling_threshold: 0.9,
            max_agents: 10
          }
        })
      }),
      embed: vi.fn()
    })
  };
});

describe("applyEcosystemInsights Unit Test", () => {
  let mockStoreCall: any;

  beforeEach(() => {
    mockStoreCall = vi.fn();
    (global as any).mockBrainStoreCall = mockStoreCall;
    for (const key in mockMemoryStore) { delete mockMemoryStore[key]; }
  });

  it("should fetch policy, parse it, and apply config parameters to discovered child agencies", async () => {
    const memory = new EpisodicMemory();
    const result = await applyEcosystemInsights(memory);

    expect(result.status).toBe("success");
    expect(result.changes.length).toBe(1);

    const change = result.changes[0];
    expect(change.agency_id).toBe("agency_1");
    expect(change.previous_config).toEqual({ current_param: 1, scaling_threshold: 0.5 });
    expect(change.new_config).toEqual({ current_param: 1, scaling_threshold: 0.9, max_agents: 10 });

    expect(mockStoreCall).toHaveBeenCalledTimes(1);
    const storeArgs = mockStoreCall.mock.calls[0][0];
    expect(storeArgs.taskId).toBe("swarm_config:agency_1");
    expect(storeArgs.artifacts).toBe(JSON.stringify({ current_param: 1, scaling_threshold: 0.9, max_agents: 10 }));
  });
});
