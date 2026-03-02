import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HRServer } from "../index.js";
import { join } from "path";
import { writeFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

// Mock dependencies
vi.mock("../../../llm/index.js", () => {
  return {
    createLLM: () => ({
      generate: vi.fn().mockResolvedValue({
        message: JSON.stringify({
          analysis: "Test Analysis",
          improvement_needed: true,
          title: "Test Improvement",
          description: "Improve logs",
          affected_files: ["test.ts"],
          patch: "diff content"
        })
      }),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    }),
  };
});

vi.mock("../../../brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      recall() {
        return Promise.resolve([]);
      }
      init() { return Promise.resolve(); }
    }
  };
});

const AGENT_DIR = join(process.cwd(), ".agent");
const HR_DIR = join(AGENT_DIR, "hr");
const LOGS_FILE = join(AGENT_DIR, "sop_logs.json");
const PROPOSALS_FILE = join(HR_DIR, "proposals.json");

describe("HRServer Integration", () => {
  let server: HRServer;

  beforeEach(async () => {
    // Ensure directories exist
    if (!existsSync(AGENT_DIR)) await mkdir(AGENT_DIR, { recursive: true });
    if (!existsSync(HR_DIR)) await mkdir(HR_DIR, { recursive: true });

    // Clear existing files
    if (existsSync(PROPOSALS_FILE)) await rm(PROPOSALS_FILE);
    if (existsSync(LOGS_FILE)) await rm(LOGS_FILE);

    server = new HRServer();
  });

  afterEach(async () => {
    if (existsSync(PROPOSALS_FILE)) await rm(PROPOSALS_FILE);
    if (existsSync(LOGS_FILE)) await rm(LOGS_FILE);
    vi.clearAllMocks();
  });

  it("should analyze logs and create a proposal", async () => {
    // Write mock logs
    const mockLogs = [
      {
        sop: "test.md",
        result: {
          success: false,
          logs: [{ step: "1", status: "error", output: "failed", timestamp: "now" }]
        },
        timestamp: "now"
      }
    ];
    await writeFile(LOGS_FILE, JSON.stringify(mockLogs));

    const result = await server.analyzeLogs({ limit: 1 });
    expect(result.content[0].text).toContain("Proposal Created");
    expect(result.content[0].text).toContain("Test Improvement");
  });

  it("should propose a change manually", async () => {
    const result = await server.proposeChange({
      title: "Manual Fix",
      description: "Fixing X",
      affectedFiles: ["x.ts"],
      patch: "diff"
    });

    expect(result.content[0].text).toContain("created with ID");
  });

  it("should list pending proposals", async () => {
    // Add one first
    await server.proposeChange({
      title: "Pending One",
      description: "Desc",
      affectedFiles: [],
      patch: ""
    });

    const result = await server.listPendingProposals();

    expect(result.content[0].text).toContain("Pending One");
    expect(result.content[0].text).toContain("Status: pending");
  });
});
