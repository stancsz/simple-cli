import { SimpleToolsServer } from "../src/mcp_servers/simple_tools/index.js";
import { JulesServer } from "../src/mcp_servers/jules/index.js";
import { OpenCoworkServer } from "../src/mcp_servers/opencowork/index.js";
import { OpenClawServer } from "../src/mcp_servers/openclaw/index.js";
import { CrewAIServer } from "../src/mcp_servers/crewai/index.js";
import { CloudflareBrowserServer } from "../src/mcp_servers/cloudflare_browser/index.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

async function verifySimpleTools() {
  console.log("Verifying SimpleToolsServer...");
  const server = new SimpleToolsServer();

  // Test valid input
  try {
    // We can't easily test valid execution because it accesses FS/ContextManager.
    // But we can test validation failure.
    await server.handleCallTool("read_file", {});
    console.error("FAILED: SimpleToolsServer.read_file should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: SimpleToolsServer.read_file validation");
    } else {
      console.error("FAILED: SimpleToolsServer.read_file unexpected error", e);
      process.exit(1);
    }
  }
}

async function verifyJules() {
  console.log("Verifying JulesServer...");
  const server = new JulesServer();

  try {
    await server.handleCallTool("jules_task", { task: 123 }); // Invalid type
    console.error("FAILED: JulesServer.jules_task should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: JulesServer.jules_task validation");
    } else {
      console.error("FAILED: JulesServer.jules_task unexpected error", e);
      process.exit(1);
    }
  }
}

async function verifyOpenCowork() {
  console.log("Verifying OpenCoworkServer...");
  const server = new OpenCoworkServer();

  try {
    await server.handleCallTool("hire_worker", { role: "coder" }); // Missing name
    console.error("FAILED: OpenCoworkServer.hire_worker should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: OpenCoworkServer.hire_worker validation");
    } else {
      console.error("FAILED: OpenCoworkServer.hire_worker unexpected error", e);
      process.exit(1);
    }
  }
}

async function verifyOpenClaw() {
  console.log("Verifying OpenClawServer...");
  const server = new OpenClawServer();

  try {
    await server.handleCallTool("openclaw_run", {}); // Missing skill
    console.error("FAILED: OpenClawServer.openclaw_run should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: OpenClawServer.openclaw_run validation");
    } else {
      console.error("FAILED: OpenClawServer.openclaw_run unexpected error", e);
      process.exit(1);
    }
  }
}

async function verifyCrewAI() {
  console.log("Verifying CrewAIServer...");
  const server = new CrewAIServer();

  try {
    await server.handleCallTool("start_crew", { task: 123 }); // Invalid type
    console.error("FAILED: CrewAIServer.start_crew should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: CrewAIServer.start_crew validation");
    } else {
      console.error("FAILED: CrewAIServer.start_crew unexpected error", e);
      process.exit(1);
    }
  }
}

async function verifyCloudflareBrowser() {
  console.log("Verifying CloudflareBrowserServer...");
  const server = new CloudflareBrowserServer();

  try {
    await server.handleCallTool("fetch_markdown", {}); // Missing url
    console.error("FAILED: CloudflareBrowserServer.fetch_markdown should have failed validation");
    process.exit(1);
  } catch (e: any) {
    if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
      console.log("PASSED: CloudflareBrowserServer.fetch_markdown validation");
    } else {
      console.error("FAILED: CloudflareBrowserServer.fetch_markdown unexpected error", e);
      process.exit(1);
    }
  }
}

async function main() {
  try {
    await verifySimpleTools();
    await verifyJules();
    await verifyOpenCowork();
    await verifyOpenClaw();
    await verifyCrewAI();
    await verifyCloudflareBrowser();
    console.log("All verifications passed!");
  } catch (e) {
    console.error("Verification script failed", e);
    process.exit(1);
  }
}

main();
