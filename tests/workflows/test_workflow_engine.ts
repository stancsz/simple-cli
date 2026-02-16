import { WorkflowEngine } from "../../src/workflows/workflow_engine.js";
import { Registry, Tool } from "../../src/engine.js";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const WORKFLOW_DIR = ".agent/workflows";
const TEST_SOP_NAME = "test_sop_self_contained";
const TEST_SOP_FILE = join(WORKFLOW_DIR, `${TEST_SOP_NAME}.sop.yaml`);

const TEST_SOP_CONTENT = `
name: ${TEST_SOP_NAME}
description: Self contained test SOP
params:
  - input_obj
steps:
  - name: step1
    tool: echo_tool
    args:
      data: "{{ params.input_obj }}"
  - name: step2
    tool: check_type_tool
    args:
      data: "{{ steps.step1 }}"
    condition: "{{ params.should_run }} == 'true'"
`;

const mockEchoTool: Tool = {
  name: "echo_tool",
  description: "Echo tool",
  execute: async (args: any) => {
    console.log(`[MockTool: echo_tool] args:`, args);
    return args.data; // Return as is
  }
};

const mockCheckTypeTool: Tool = {
  name: "check_type_tool",
  description: "Check type tool",
  execute: async (args: any) => {
    console.log(`[MockTool: check_type_tool] args:`, args);
    if (typeof args.data === 'object' && args.data !== null) {
        return "received object";
    }
    return "received " + typeof args.data;
  }
};

async function setup() {
    if (!existsSync(WORKFLOW_DIR)) {
        await mkdir(WORKFLOW_DIR, { recursive: true });
    }
    await writeFile(TEST_SOP_FILE, TEST_SOP_CONTENT);
}

async function cleanup() {
    if (existsSync(TEST_SOP_FILE)) {
        await unlink(TEST_SOP_FILE);
    }
}

async function runTest() {
  await setup();

  try {
      // Mock Registry
      const registry = {
        tools: new Map<string, Tool>()
      } as unknown as Registry;

      registry.tools.set("echo_tool", mockEchoTool);
      registry.tools.set("check_type_tool", mockCheckTypeTool);

      const engine = new WorkflowEngine(registry);

      console.log("--- Testing Type Preservation ---");
      const inputObj = { foo: "bar", num: 123 };
      const result = await engine.executeSOP(TEST_SOP_NAME, { input_obj: inputObj, should_run: "true" });

      console.log("Result:", JSON.stringify(result, null, 2));

      // Verify step1 output
      const step1Log = result.logs.find(l => l.step === "step1");
      // Note: step1Log.output might be the object itself
      if (step1Log && JSON.stringify(step1Log.output) === JSON.stringify(inputObj)) {
          console.log("PASSED: Step 1 output matches input object.");
      } else {
          throw new Error("FAILED: Step 1 output mismatch.");
      }

      // Verify step2 input (via args log in mock tool)
      // Since we can't inspect mock call arguments directly easily without spy, we check output
      const step2Log = result.logs.find(l => l.step === "step2");
      if (step2Log && step2Log.output === "received object") {
          console.log("PASSED: Step 2 received object.");
      } else {
          throw new Error(`FAILED: Step 2 did not receive object. Output: ${step2Log?.output}`);
      }

  } catch (e) {
      console.error(e);
      process.exit(1);
  } finally {
      await cleanup();
  }
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
