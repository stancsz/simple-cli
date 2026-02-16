import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SopServer } from "../../src/mcp_servers/sop/index.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), ".agent_test_sop");
const SOP_DIR = join(TEST_DIR, "sops");

describe("SOP MCP Server", () => {
  let server: SopServer;

  beforeEach(async () => {
    // Setup test directory
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(SOP_DIR, { recursive: true });

    // Create a dummy SOP
    const dummySop = `
name: test-sop
description: A test SOP
steps:
  - name: Step 1
    type: command
    command: echo "Hello World"
  - name: Step 2
    type: command
    command: echo "Step 2"
`;
    await writeFile(join(SOP_DIR, "test.yaml"), dummySop);

    // Initialize server with test directory
    server = new SopServer(SOP_DIR);
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  async function callTool(name: string, args: any) {
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  }

  it("should list SOPs", async () => {
    const result = await callTool("sop_list", {});
    expect(result.content[0].text).toContain("test-sop");
    expect(result.content[0].text).toContain("A test SOP");
  });

  it("should get an SOP", async () => {
    const result = await callTool("sop_get", { name: "test" });
    expect(result.content[0].text).toContain("name: test-sop");
    expect(result.content[0].text).toContain("Hello World");
  });

  it("should run an SOP", async () => {
    const result = await callTool("sop_run", { name: "test" });
    const output = result.content[0].text;

    expect(output).toContain("## Step 1");
    expect(output).toContain("> Running: echo \"Hello World\"");
    expect(output).toContain("Output:\nHello World");
    expect(output).toContain("✔ Success");

    expect(output).toContain("## Step 2");
    expect(output).toContain("Output:\nStep 2");
  });

  it("should handle manual steps in SOP", async () => {
      const manualSop = `
name: manual-sop
steps:
  - name: Manual Step
    type: agent
    content: Do something manually
`;
      await writeFile(join(SOP_DIR, "manual.yaml"), manualSop);

      const result = await callTool("sop_run", { name: "manual" });
      const output = result.content[0].text;

      expect(output).toContain("⚠ Manual Step Required: Do something manually");
      expect(result.isError).toBe(true);
  });
});
