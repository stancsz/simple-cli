import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { analyzeCrossSwarmPatterns } from "../../src/mcp_servers/hr/tools/pattern_analysis.js";
import { generateSOPFromPatterns } from "../../src/mcp_servers/hr/tools/sop_generation.js";
import { DreamingServer } from "../../src/mcp_servers/dreaming/index.js";
import { unlink, access } from "fs/promises";
import { join } from "path";

// Mock dependencies
const mockRecall = vi.fn();
const mockStore = vi.fn();
const mockGenerate = vi.fn();

const mockMemory = {
  recall: mockRecall,
  store: mockStore,
} as any;

const mockLLM = {
  generate: mockGenerate,
} as any;

// Mock MCP for Dreaming
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();

vi.mock("../../src/mcp.js", () => {
  return {
    MCP: vi.fn().mockImplementation(() => ({
      init: vi.fn(),
      getClient: mockGetClient
    }))
  };
});

describe("HR & Dreaming Enhancement", () => {
  const generatedSOPPath = join(process.cwd(), "sops", "test_sop_gen.md");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    try {
        await unlink(generatedSOPPath);
    } catch {}
  });

  describe("HR Tools", () => {
    it("analyze_cross_swarm_patterns should query memory and return analysis", async () => {
      mockRecall.mockResolvedValue([
        { taskId: "1", userPrompt: "test", agentResponse: "success", timestamp: 100, type: "task" }
      ]);
      mockGenerate.mockResolvedValue({ message: '{"sop_candidate": true, "patterns": []}' });

      const result = await analyzeCrossSwarmPatterns(mockMemory, mockLLM, { limit: 5 });

      expect(mockRecall).toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalled();
      expect(result.content[0].text).toContain("sop_candidate");
    });

    it("generate_sop_from_patterns should create a file", async () => {
      mockGenerate.mockResolvedValue({ message: "# SOP Content" });

      const result = await generateSOPFromPatterns(mockLLM, {
        pattern_analysis: "analysis",
        title: "Test SOP",
        filename: "test_sop_gen.md"
      });

      expect(result.content[0].text).toContain("saved to");

      // Verify file exists
      try {
          await access(generatedSOPPath);
          expect(true).toBe(true);
      } catch {
          throw new Error(`SOP file not found at ${generatedSOPPath}`);
      }
    });
  });

  describe("Dreaming Cycle", () => {
    it("should trigger HR tools on success", async () => {
        const dreaming = new DreamingServer();

        // Mock Clients
        const mockBrain = {
            callTool: vi.fn().mockImplementation((args) => {
                if (args.name === "brain_query") return { content: [{ text: JSON.stringify([{ id: "1", taskId: "t1", userPrompt: "fail", agentResponse: "err" }]) }] };
                return { content: [{ text: "ok" }] };
            })
        };
        const mockSwarm = {
            callTool: vi.fn().mockImplementation((args) => {
                if (args.name === "list_agents") return { content: [{ text: "[]" }] };
                if (args.name === "negotiate_task") return { content: [{ text: JSON.stringify({ winning_bid: { role: "coder" } }) }] };
                if (args.name === "run_simulation") return { content: [{ text: "Success!" }] };
                return {};
            })
        };
        const mockHR = {
            callTool: vi.fn().mockImplementation((args) => {
                if (args.name === "analyze_cross_swarm_patterns") return { content: [{ text: '{"sop_candidate": true}' }] };
                if (args.name === "generate_sop_from_patterns") return { content: [{ text: "SOP generated saved to: ..." }] };
                return {};
            })
        };

        mockGetClient.mockImplementation((name) => {
            if (name === "brain") return mockBrain;
            if (name === "swarm-server") return mockSwarm;
            if (name === "hr_loop") return mockHR;
            return undefined;
        });

        await dreaming.startSession(1);

        expect(mockHR.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "analyze_cross_swarm_patterns" }));
        expect(mockHR.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "generate_sop_from_patterns" }));
        expect(mockBrain.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "brain_update_graph" }));

        // Verify metadata update in Brain
        expect(mockBrain.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_store",
            arguments: expect.objectContaining({
                dreaming_outcomes: expect.stringContaining("sop_generated_from_pattern")
            })
        }));
    });
  });
});
