import { describe, it, expect, vi, beforeEach } from "vitest";
import { DreamSimulator } from "../../src/mcp_servers/dreaming/simulation.js";

// Mocks
const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
const mockExistsSync = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (path: any) => mockReadFile(path),
  readdir: (path: any) => mockReaddir(path),
  stat: (path: any) => Promise.resolve({ mtimeMs: Date.now() }),
}));

vi.mock("fs", () => ({
  existsSync: (path: any) => mockExistsSync(path),
}));

const mockGenerate = vi.fn();
vi.mock("../../src/llm.js", () => ({
  createLLM: () => ({
    generate: mockGenerate,
  }),
}));

const mockStartCrew = vi.fn();
vi.mock("../../src/mcp_servers/crewai/index.js", () => ({
  CrewAIServer: class {
    async startCrew(task: any) {
      return mockStartCrew(task);
    }
  },
}));

const mockStore = vi.fn();
const mockRecall = vi.fn();
vi.mock("../../src/brain/episodic.js", () => ({
  EpisodicMemory: class {
    async store(...args: any[]) { return mockStore(...args); }
    async recall(...args: any[]) { return mockRecall(...args); }
  },
}));

describe("Dreaming Integration", () => {
  let simulator: DreamSimulator;

  beforeEach(() => {
    vi.clearAllMocks();
    simulator = new DreamSimulator();
    mockExistsSync.mockReturnValue(true);
  });

  it("should scan failures from logs", async () => {
    mockReaddir.mockResolvedValue(["error.log"]);
    mockReadFile.mockResolvedValue(`
Task: Fix the bug
Some info...
Error: NullReferenceException
    `);

    const failures = await simulator.scanFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].task).toBe("Fix the bug");
    expect(failures[0].error).toBe("Error: NullReferenceException");
  });

  it("should generate, simulate, and store strategy", async () => {
    // Setup failure
    const failure = {
      id: "1",
      task: "Fix bug",
      error: "Error: Fail",
      sourceFile: "log.log",
      timestamp: "now"
    };

    // Mock LLM
    mockGenerate.mockResolvedValue({ message: "Use a try-catch block" });

    // Mock CrewAI success
    mockStartCrew.mockResolvedValue({
      content: [{ type: "text", text: "Simulation Output: Success! The fix worked." }]
    });

    // Run flow
    const strategy = await simulator.generateStrategy(failure as any);
    expect(strategy.proposedApproach).toBe("Use a try-catch block");

    const result = await simulator.runSimulation(strategy);
    expect(result.outcome).toBe("success");

    await simulator.storeInsight(result);
    expect(mockStore).toHaveBeenCalledWith(
      expect.stringContaining("dream-"),
      expect.stringContaining("Task: Fix bug"),
      expect.stringContaining("Strategy: Use a try-catch block"),
      ["dream-simulation"],
      "dreaming"
    );
  });

    it("should retrieve dream insights", async () => {
        mockRecall.mockResolvedValue([
            { userPrompt: "Fix bug", agentResponse: "Use try-catch", timestamp: Date.now(), artifacts: [], vector: [], taskId: "1" }
        ]);

        const insights = await simulator.getInsights("bug");
        expect(insights).toHaveLength(1);
        expect(insights[0]).toContain("Strategy: Use try-catch");
    });
});
