import { tool } from "../../tools/claw.ts";
import assert from "assert";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

async function runTests() {
  console.log("🧪 Starting Claw Integration Tests...");

  // Test 1: Discovery
  console.log("T1: Testing Discovery...");
  const list = await tool.execute({ action: "list", skillName: undefined });
  const fs = await import("fs");
  fs.writeFileSync("debug-list.log", list as string);
  assert.ok(
    typeof list === "string" && list.includes("clawJit"),
    "List should include clawJit",
  );
  console.log("✅ Discovery Passed");

  // Test 2: Inspect
  console.log("T2: Testing Inspection...");
  const inspect = await tool.execute({
    action: "inspect",
    skillName: "clawJit",
  });
  const inspectJson = JSON.parse(inspect);
  assert.strictEqual(
    inspectJson.definition.name,
    "clawJit",
    "Should return correct skill definition",
  );
  console.log("✅ Inspection Passed");

  // Test 3: JIT Execution
  console.log("T3: Testing JIT Execution...");
  const output = await tool.execute({
    action: "run",
    skillName: "clawJit",
    args: { intent: "Test Security Audit" },
  });
  console.log("T3 Output:", output);

  const agentFile = join(process.cwd(), ".simple", "workdir", "AGENT.md");
  assert.ok(existsSync(agentFile), "AGENT.md should be created");
  const agentContent = readFileSync(agentFile, "utf-8");
  // LLM-generated content may vary, so check for key concepts
  assert.ok(
    agentContent.toLowerCase().includes("security") ||
      agentContent.toLowerCase().includes("audit"),
    "AGENT.md should relate to the intent",
  );
  console.log("✅ JIT Execution Passed");

  // Test 4: Brain
  console.log("T4: Testing Brain (Memory)...");
  await tool.execute({
    action: "run",
    skillName: "clawBrain",
    args: { action: "init" },
  });
  const memoryDir = join(process.cwd(), ".simple", "workdir", "memory");
  assert.ok(
    existsSync(join(memoryDir, "notes")),
    "Memory notes dir should exist",
  );

  await tool.execute({
    action: "run",
    skillName: "clawBrain",
    args: { action: "reflect", content: "Test Reflection" },
  });
  // Check if reflection file exists (rough check)
  // ...
  console.log("✅ Brain Passed");

  // Test 5: Ghost
  console.log("T5: Testing Persistence...");
  await tool.execute({
    action: "run",
    skillName: "clawGhost",
    args: { action: "schedule", intent: "Ghost Run", cron: "* * * * *" },
  });
  const ghostsFile = join(process.cwd(), ".simple", "workdir", "ghosts.json");
  assert.ok(existsSync(ghostsFile), "ghosts.json should exist");
  console.log("✅ Ghost Passed");

  console.log("\n🎉 ALL TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("❌ Tests Failed:", err);
  process.exit(1);
});
