import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { applyEcosystemInsights } from "../../src/mcp_servers/agency_orchestrator/tools/apply_ecosystem_insights.js";
import { proposeEcosystemPolicyUpdate } from "../../src/mcp_servers/brain/tools/strategy.js";
import { createLLM } from "../../src/llm.js";

// Mock LLM completely to prevent any API calls
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: vi.fn().mockImplementation(() => {
      return {
        generate: vi.fn(),
        embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
      };
    })
  };
});

// Since the Brain client connects to a spawned child process,
// mock the Client so we can simulate the `brain_query` and `brain_store`
// calls as resolving against an in-memory database during integration testing.
const mockMemoryStore: Record<string, any> = {};

// Avoid LanceDB lock issues
vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() {}
      async store(taskId: string, request: string, solution: string, tags: string[], namespace?: string, simAttempts?: any, resolved_via_dreaming?: any, dreaming_outcomes?: any, id?: string, tokens?: any, duration?: any, type?: string) {
        const storedType = type || (restArgs.length >= 6 ? restArgs[5] : "unknown");
        const storedId = id || taskId;
        mockMemoryStore[storedId] = { id: storedId, request, solution, tags, namespace, type: storedType };
        return true;
      }
      async recall(topic: string, limit: number, namespace: string, type?: string) {
        return Object.values(mockMemoryStore).filter(entry =>
            (entry.id.includes(topic) || (entry.request && entry.request.includes(topic)) || (entry.type && entry.type.includes(topic))) &&
            (!type || entry.type === type)
        ).slice(0, limit);
      }
    }
  };
});

// Polyfill for rest args that TS missed in the mock
let restArgs: any[] = [];

describe("Phase 35 Validation: Apply Ecosystem Insights", () => {
  let llmInstance: any;
  let memory: any;

  beforeEach(() => {
    // Clear global stores
    for (const key in mockMemoryStore) {
        delete mockMemoryStore[key];
    }

    // Reset the LLM mock
    const llmMockFn = (createLLM as any) as ReturnType<typeof vi.fn>;
    llmInstance = {
      generate: vi.fn(),
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
    };
    llmMockFn.mockReturnValue(llmInstance);

    memory = new EpisodicMemory();
  });

  it("should generate a policy update and apply it as a swarm config adjustment", async () => {
    // 1. Setup existing state: A child agency exists.
    mockMemoryStore["spawn_agency_1"] = {
        id: "spawn_agency_1",
        request: "spawn",
        solution: "{}",
        tags: ["agency_1", "agency_spawning"],
        type: "autonomous_decision"
    };
    // Child agency has an initial swarm config
    mockMemoryStore["swarm_config:agency_1"] = {
        id: "swarm_config:agency_1",
        request: "config",
        solution: JSON.stringify({ max_agents: 3, strategy: "safe" }),
        type: "swarm_configuration"
    };

    // 2. Simulate the Brain proposing an ecosystem policy update
    llmInstance.generate
      .mockResolvedValueOnce({
        // First LLM call: draft policy
        message: JSON.stringify({
          proposal: "Scale up agents to handle market demand",
          rationale: "Analysis shows bottlenecks in current tasks",
          scope: "ecosystem"
        })
      })
      .mockResolvedValueOnce({
        // Second LLM call: generate new strategy object (inside proposeStrategicPivot)
        message: JSON.stringify({
          vision: "Global scalable AI",
          objectives: ["Handle more tasks"],
          policies: { "scaling": "Aggressive scaling required." },
          rationale: "Ecosystem policy updated"
        })
      });

    const policyResult = await proposeEcosystemPolicyUpdate(memory, llmInstance, { insights: "bottleneck detected" });
    expect(policyResult.ecosystem_proposal.proposal).toBe("Scale up agents to handle market demand");

    // Because proposeEcosystemPolicyUpdate now explicitly saves as 'ecosystem_policy',
    // verify it is in the mock store.
    const savedEcoKeys = Object.values(mockMemoryStore).filter(k => k.type === "ecosystem_policy");
    expect(savedEcoKeys.length).toBe(1);

    // 3. Execute applyEcosystemInsights via orchestrator tool
    // Mock the LLM call that the orchestrator tool uses to parse the policy
    llmInstance.generate.mockResolvedValueOnce({
      message: JSON.stringify({
        target_agencies: ["agency_1"],
        parameters: { max_agents: 10, scaling_threshold: 0.9 }
      })
    });

    const orchestratorResult = await applyEcosystemInsights(memory);

    // 4. Validate outcomes
    expect(orchestratorResult.status).toBe("success");
    expect(orchestratorResult.changes.length).toBe(1);

    const change = orchestratorResult.changes[0];
    expect(change.agency_id).toBe("agency_1");

    // 5. Verify it updated EpisodicMemory
    const storedConfig = mockMemoryStore["swarm_config:agency_1"];
    expect(storedConfig).toBeDefined();

    const finalConfig = JSON.parse(storedConfig.solution);
    // It merged the old parameter ("strategy") with the new ones ("max_agents", "scaling_threshold")
    expect(finalConfig.strategy).toBe("safe");
    expect(finalConfig.max_agents).toBe(10);
    expect(finalConfig.scaling_threshold).toBe(0.9);
  });
});
