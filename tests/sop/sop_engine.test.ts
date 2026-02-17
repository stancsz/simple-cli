import { test, expect, describe, vi, beforeEach } from "vitest";
import { SOPParser } from "../../src/mcp_servers/sop-executor/parser.js";
import { SOPExecutor } from "../../src/mcp_servers/sop-executor/executor.js";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

// Mock SopExecutorClient
vi.mock("../../src/mcp_servers/sop-executor/client.js", () => {
  return {
    SopExecutorClient: class {
      init = vi.fn();
      executeTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      getToolNames = vi.fn().mockReturnValue(["tool1", "tool2"]);
      close = vi.fn();
    }
  };
});

// Mock LLM
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: vi.fn().mockResolvedValue({
        thought: "test",
        tool: "tool1",
        args: { val: 1 }
      })
    })
  };
});

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
      // Parser is async
      const result = await parser.parse(filepath); // Parser logic converts legacy YAML steps to instructions
      // It sets name to filename base. "simple".
      expect(result.name).toBe("simple");

      // Step name
      expect(result.steps[0].name).toBe("Step 1");

      // Instruction should be description
      expect(result.steps[0].instruction).toBe("Do something.");

      // Tool and Args are dropped by parser in favor of Smart Router logic (LLM decides tool)
    });
  });

  describe("SOP Executor", () => {
    test("runs simple flow", async () => {
        const executor = new SOPExecutor();
        const filepath = join(testDir, "test.md");
        await writeFile(filepath, `---
name: Test SOP
goal: Test Goal
steps:
  - name: Step 1
    description: Test step
---
`);
       const result = await executor.run(filepath);
       expect(result).toBeDefined();
       // Since it runs in loop until completion, and mock returns tool execution,
       // it should eventually complete.
    });
  });
});
