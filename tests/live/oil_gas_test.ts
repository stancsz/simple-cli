import { Engine, Context, Registry } from "../../src/engine/orchestrator.js";
import { createLLM } from "../../src/llm.js";
import { MCP } from "../../src/mcp.js";
import { getActiveSkill } from "../../src/skills.js";
import { WorkflowEngine } from "../../src/workflows/workflow_engine.js";
import { SOPRegistry } from "../../src/workflows/sop_registry.js";
import { createExecuteSOPTool } from "../../src/workflows/execute_sop_tool.js";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  console.log("Starting Oil & Gas Agent Live Test...");

  // 1. Setup Data
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const csvPath = join(dataDir, "production_data.csv");
  const csvContent = `date,well_id,oil_bbl,gas_mcf
2023-01-01,WELL-001,100,500
2023-01-02,WELL-001,110,510
2023-01-01,WELL-002,200,1000
2023-01-02,WELL-002,190,990`;
  writeFileSync(csvPath, csvContent);
  console.log(`Created dummy data at ${csvPath}`);

  // 2. Initialize Engine
  process.env.SIMPLE_CLI_SKILL = "oil_gas";

  const registry = new Registry();
  const sopRegistry = new SOPRegistry();
  const workflowEngine = new WorkflowEngine(registry, sopRegistry);
  const sopTool = createExecuteSOPTool(workflowEngine);
  registry.tools.set(sopTool.name, sopTool as any);

  const mcp = new MCP();
  await mcp.init();

  // Start required servers
  const coreServers = ["filesystem", "git", "openclaw"];
  for (const s of coreServers) {
      if (!mcp.isServerRunning(s)) {
          console.log(`Starting server: ${s}`);
          try {
            await mcp.startServer(s);
          } catch(e: any) {
            console.error(`Failed to start ${s}:`, e.message);
          }
      }
  }

  // Add tools to registry
  const tools = await mcp.getTools();
  console.log(`Available tools: ${tools.map(t => t.name).join(", ")}`);
  tools.forEach((t) => registry.tools.set(t.name, t as any));

  const provider = createLLM();
  const engine = new Engine(provider, registry, mcp);

  // 3. Run Agent
  const cwd = process.cwd();
  const skill = await getActiveSkill(cwd);
  console.log(`Active Skill: ${skill.name}`);
  const ctx = new Context(cwd, skill);

  const prompt = "Read 'data/production_data.csv', calculate the total oil production per well using python pandas, save the result to 'data/oil_summary.csv', and commit the new file to git with message 'Add oil summary'.";

  console.log(`Running prompt: "${prompt}"`);
  await engine.run(ctx, prompt, { interactive: false });

  // 4. Verify Results
  const summaryPath = join(dataDir, "oil_summary.csv");
  if (existsSync(summaryPath)) {
      console.log("SUCCESS: 'data/oil_summary.csv' created.");
      const content = readFileSync(summaryPath, "utf-8");
      console.log("Content:\n", content);

      // Check content (WELL-001: 210, WELL-002: 390)
      if (content.includes("WELL-001") && content.includes("210") && content.includes("WELL-002") && content.includes("390")) {
          console.log("VERIFICATION PASSED: Data calculation correct.");
      } else {
          console.error("VERIFICATION FAILED: Content incorrect.");
          // Maybe column order differs, but numbers should be there.
      }
  } else {
      console.error("FAILURE: 'data/oil_summary.csv' not found.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
