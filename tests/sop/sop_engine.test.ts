import { test, expect, describe, vi, beforeEach } from "vitest";
import { SOPParser } from "../../src/sop/sop_parser.js";
import { SOPEngine } from "../../src/sop/SOPEngine.js";
import { join } from "path";
import { writeFile, unlink, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

// Mock SopMcpClient
const mockClient = {
  init: vi.fn(),
  executeTool: vi.fn(),
  getToolNames: vi.fn(),
  close: vi.fn(),
};

describe("SOP System", () => {
  const testDir = join(process.cwd(), ".agent", "sops", "test_sop_system");

  beforeEach(async () => {
    vi.clearAllMocks();
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  describe("SOP Parser", () => {
    test("parses simple SOP", async () => {
      const filepath = join(testDir, "simple.md");

      const content = `# Simple SOP

- [ ] Step 1
  Description: Do something.
  Tool: test_tool
  Args: { "foo": "bar" }
`;
      await writeFile(filepath, content);

      const parser = new SOPParser();
      const result = await parser.parse(filepath);

      expect(result.name).toBe("Simple SOP");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].name).toBe("Step 1");
      expect(result.steps[0].tool_call).toEqual({ tool: "test_tool", args: { foo: "bar" } });
    });

    test("parses multiline JSON args", async () => {
        const filepath = join(testDir, "multiline.md");
        const content = `# Multiline SOP
- [ ] Step 1
  Tool: complex_tool
  Args: {
    "a": 1,
    "b": [2, 3]
  }
`;
        await writeFile(filepath, content);
        const parser = new SOPParser();
        const result = await parser.parse(filepath);
        expect(result.steps[0].tool_call?.args).toEqual({ a: 1, b: [2, 3] });
    });
  });

  describe("SOP Engine", () => {
    const engine = new SOPEngine(mockClient as any, testDir);

    test("executes sequential steps with interpolation", async () => {
      const filepath = join(testDir, "seq.md");

      const content = `# Sequential SOP

- [ ] Step 1
  Tool: tool1
  Args: { "val": 1 }

- [ ] Step 2
  Tool: tool2
  Args: { "prev": "{{ steps.Step 1.result }}" }
`;
      await writeFile(filepath, content);

      mockClient.executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"result": 10}' }] });
      mockClient.executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '"done"' }] });

      const result = await engine.executeSOP("seq");

      expect(result.success).toBe(true);
      expect(mockClient.executeTool).toHaveBeenCalledTimes(2);
      expect(mockClient.executeTool).toHaveBeenNthCalledWith(1, "tool1", { val: 1 });
      expect(mockClient.executeTool).toHaveBeenNthCalledWith(2, "tool2", { prev: 10 });
    });

    test("handles conditions", async () => {
        const filepath = join(testDir, "cond.md");
        const content = `# Conditional SOP
- [ ] Step 1
  Tool: tool1
  Args: {}

- [ ] Step 2
  Condition: {{ steps.Step 1.value }} == "yes"
  Tool: tool2
  Args: {}
`;
        await writeFile(filepath, content);

        // Scenario 1: Condition false
        mockClient.executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"value": "no"}' }] });
        let result = await engine.executeSOP("cond");
        expect(mockClient.executeTool).toHaveBeenCalledTimes(1); // Step 2 skipped
        expect(result.logs[1].status).toBe("skipped");

        mockClient.executeTool.mockClear();

        // Scenario 2: Condition true
        mockClient.executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"value": "yes"}' }] });
        mockClient.executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: "ok" }] });
        result = await engine.executeSOP("cond");
        expect(mockClient.executeTool).toHaveBeenCalledTimes(2);
    });
  });
});
