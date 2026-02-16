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

      const content = `---
name: Simple SOP
steps:
  - name: Step 1
    description: Do something.
    tool: test_tool
    args:
      foo: bar
---
`;
      await writeFile(filepath, content);

      const parser = new SOPParser();
      const result = await parser.parse(filepath);

      expect(result.name).toBe("Simple SOP");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].name).toBe("Step 1");
      expect(result.steps[0].tool).toBe("test_tool");
      expect(result.steps[0].args).toEqual({ foo: "bar" });
    });

    test("parses multiline JSON args", async () => {
        const filepath = join(testDir, "multiline.md");
        const content = `---
name: Multiline SOP
steps:
  - name: Step 1
    tool: complex_tool
    args:
      a: 1
      b:
        - 2
        - 3
---
`;
        await writeFile(filepath, content);
        const parser = new SOPParser();
        const result = await parser.parse(filepath);
        expect(result.steps[0].args).toEqual({ a: 1, b: [2, 3] });
    });

    test("parses simple SOP with bullet points", async () => {
      const filepath = join(testDir, "bullet.md");

      const content = `# Simple Bullet SOP

- Step 1
  Description: Do something.
  Tool: test_tool
  Args: { "foo": "bar" }
`;
      await writeFile(filepath, content);

      const parser = new SOPParser();
      const result = await parser.parse(filepath);

      expect(result.name).toBe("Simple Bullet SOP");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].name).toBe("Step 1");
      expect(result.steps[0].tool).toBe("test_tool");
      expect(result.steps[0].args).toEqual({ foo: "bar" });
    });

    test("parses numbered SOP with args", async () => {
        const filepath = join(testDir, "numbered.md");
        const content = `# Numbered SOP
1. Step 1
   Tool: tool1
   Args: {"a": 1}

2. Step 2
   Tool: tool2
   Args: {"b": 2}
`;
        await writeFile(filepath, content);
        const parser = new SOPParser();
        const result = await parser.parse(filepath);
        expect(result.steps).toHaveLength(2);
        expect(result.steps[0].name).toBe("Step 1");
        expect(result.steps[0].args).toEqual({ a: 1 });
        expect(result.steps[1].name).toBe("Step 2");
    });
  });

  describe("SOP Engine", () => {
    const engine = new SOPEngine(mockClient as any, testDir);

    test("executes sequential steps with interpolation", async () => {
      const filepath = join(testDir, "seq.md");

      const content = `---
name: Sequential SOP
steps:
  - name: Step 1
    tool: tool1
    args:
      val: 1

  - name: Step 2
    tool: tool2
    args:
      prev: "{{ steps['Step 1'] }}"
---
`;
      // Note: Interpolation syntax might differ slightly based on SOPEngine implementation.
      // SOPEngine.ts: `const value = this.resolvePath(context, key);`
      // context.steps[step.name] = output;
      // So key should be "steps.Step 1" or similar.
      // But YAML keys with spaces are tricky in dot notation unless handled.
      // SOPEngine uses `path.split(".")`. So "steps.Step 1" splits into ["steps", "Step 1"].
      // Wait, "Step 1" has a space. If split by dot, it works: "steps", "Step 1".
      // But `{{ steps.Step 1 }}` regex `([^{}]+)` matches "steps.Step 1".
      // `key.trim()` gives "steps.Step 1".
      // `split(".")` gives ["steps", "Step 1"].
      // Correct.
      // However, usually we use quotes or brackets in JS.
      // But here it's custom resolution.

      // Let's use `{{ steps.Step 1 }}` in YAML string.
      // The original test used: `Args: { "prev": "{{ steps.Step 1.result }}" }`
      // My updated YAML:
      /*
      args:
        prev: "{{ steps.Step 1 }}"
      */
      // Wait, original test expected `result.success` to be true.
      // And `tool2` args to be `{ prev: 10 }`.
      // The output of `tool1` was mocked as `{ content: ... text: '{"result": 10}' }`.
      // `SOPEngine` parses text as JSON -> `{ result: 10 }`.
      // So `context.steps["Step 1"]` becomes `{ result: 10 }`.
      // So `{{ steps.Step 1.result }}` resolves to `10`.
      // So I should keep `{{ steps.Step 1.result }}`.

      const contentCorrect = `---
name: Sequential SOP
steps:
  - name: Step 1
    tool: tool1
    args:
      val: 1

  - name: Step 2
    tool: tool2
    args:
      prev: "{{ steps.Step 1.result }}"
---
`;
      await writeFile(filepath, contentCorrect);

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
        const content = `---
name: Conditional SOP
steps:
  - name: Step 1
    tool: tool1
    args: {}

  - name: Step 2
    condition: "{{ steps.Step 1.value }} == 'yes'"
    tool: tool2
    args: {}
---
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
