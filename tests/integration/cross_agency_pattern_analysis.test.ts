import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpisodicMemory, PastEpisode } from "../../src/brain/episodic.js";
import { SemanticGraph } from "../../src/brain/semantic_graph.js";
import { analyzeCrossAgencyPatterns } from "../../src/mcp_servers/brain/tools/pattern_analysis.js";
import { createLLM } from "../../src/llm.js";

// Mock the LLM to return a consistent JSON response
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: () => ({
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      generate: vi.fn().mockResolvedValue({
        message: JSON.stringify({
          summary: "Ecosystem is healthy with standardized practices.",
          common_themes: ["Standardized communication", "Efficient task delegation"],
          top_performers: ["agency-A for speed"],
          emerging_risks: ["Resource contention in agency-B"],
          recommended_actions: ["Standardize agency-A approach"]
        })
      })
    })
  };
});

// Mock SemanticGraph
vi.mock("../../src/brain/semantic_graph.js", () => {
  return {
    SemanticGraph: vi.fn().mockImplementation(() => {
      return {
        query: vi.fn().mockResolvedValue({
          nodes: [{ id: "agency-A", type: "agency" }, { id: "agency-B", type: "agency" }],
          edges: [{ from: "agency-A", to: "agency-B", relation: "collaborates_with" }]
        })
      };
    })
  };
});

// Mock EpisodicMemory
vi.mock("../../src/brain/episodic.js", () => {
  // We use an in-memory array to simulate LanceDB to avoid lock issues
  const mockMemories: PastEpisode[] = [];

  return {
    EpisodicMemory: vi.fn().mockImplementation(() => {
      return {
        store: vi.fn().mockImplementation(async (
          taskId, request, solution, artifacts, company, simAttempts, resolved_via_dreaming, dreaming_outcomes, id, tokens, duration, type, related_episode_id, forecast_horizon, error_margin, source_agency
        ) => {
          mockMemories.push({
            id: id || `mock-id-${mockMemories.length}`,
            taskId,
            timestamp: Date.now(),
            userPrompt: request,
            agentResponse: solution,
            artifacts: artifacts || [],
            vector: [],
            source_agency: source_agency || (company !== "default" ? company : ""),
            type: type || "task"
          });
        }),
        getRecentEpisodes: vi.fn().mockImplementation(async (company) => {
          if (company === "default") {
            // Root memories
            return mockMemories.filter(m => !m.source_agency || m.source_agency !== company);
          } else {
            // Namespaced memories
            return mockMemories.filter(m => m.source_agency === company);
          }
        }),
        recall: vi.fn().mockImplementation(async (query, limit, company) => {
           if (company === "default") {
             return mockMemories; // Simplified for test
           } else {
             return mockMemories.filter(m => m.source_agency === company);
           }
        }),
        __getMockMemories: () => mockMemories,
        __reset: () => { mockMemories.length = 0; }
      };
    })
  };
});

describe("Cross-Agency Pattern Analysis Integration", () => {
  let episodic: any;
  let semantic: any;
  let llm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    episodic = new EpisodicMemory();
    episodic.__reset();
    semantic = new SemanticGraph();
    llm = createLLM();
  });

  it("should analyze cross-agency patterns successfully using correct metadata", async () => {
    // 1. Simulate logging distinct episodes from different child agencies

    // Log via root default namespace but with source_agency
    await episodic.store(
      "task-1",
      "Process invoices",
      "Processed 100 invoices successfully in 5s.",
      [],
      "default", // root memory
      undefined, undefined, undefined, undefined, undefined, undefined, "task", undefined, undefined, undefined,
      "agency-A" // source agency!
    );

    // Log via namespaced memory
    await episodic.store(
      "task-2",
      "Analyze logs",
      "Failed to analyze due to memory limits.",
      [],
      "agency-B", // company/namespace
      undefined, undefined, undefined, undefined, undefined, undefined, "task", undefined, undefined, undefined,
      "agency-B"
    );

    // 2. Call the analyze tool logic
    const agencyIds = ["agency-A", "agency-B"];
    const result = await analyzeCrossAgencyPatterns(agencyIds, episodic, semantic, llm);

    // 3. Assertions
    expect(episodic.getRecentEpisodes).toHaveBeenCalledWith("agency-A", 20);
    expect(episodic.getRecentEpisodes).toHaveBeenCalledWith("agency-B", 20);
    expect(episodic.getRecentEpisodes).toHaveBeenCalledWith("default", 50);

    expect(semantic.query).toHaveBeenCalledWith("agency", "default");

    expect(llm.generate).toHaveBeenCalled();
    const llmPromptArg = llm.generate.mock.calls[0][0];

    // Verify prompt context contains our simulated data
    expect(llmPromptArg).toContain("Agency: agency-A");
    expect(llmPromptArg).toContain("Process invoices");
    expect(llmPromptArg).toContain("Agency: agency-B");
    expect(llmPromptArg).toContain("Analyze logs");
    expect(llmPromptArg).toContain("collaborates_with"); // from semantic mock

    // Verify structured output parsing
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("common_themes");
    expect(result).toHaveProperty("top_performers");
    expect(result).toHaveProperty("emerging_risks");
    expect(result).toHaveProperty("recommended_actions");
    expect(result.summary).toBe("Ecosystem is healthy with standardized practices.");
  });
});
