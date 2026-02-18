import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { tools } from '../src/mcp_servers/hr_loop/tools.js';
import { join } from 'path';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';

// Helper to mock directories
const AGENT_DIR = join(process.cwd(), ".agent");
const GHOST_LOGS_DIR = join(AGENT_DIR, "ghost_logs");
const PROPOSALS_DIR = join(AGENT_DIR, "hr_proposals");
const SOULS_DIR = join(process.cwd(), "src", "agents", "souls");
const TEST_AGENT_NAME = "test_agent_hr_loop";

describe('HR Loop MCP Server', () => {
  const setupTestEnv = async () => {
    // Clean up
    if (existsSync(GHOST_LOGS_DIR)) await rm(GHOST_LOGS_DIR, { recursive: true, force: true });
    if (existsSync(PROPOSALS_DIR)) await rm(PROPOSALS_DIR, { recursive: true, force: true });

    // Create dirs
    await mkdir(GHOST_LOGS_DIR, { recursive: true });
    await mkdir(PROPOSALS_DIR, { recursive: true });
    if (!existsSync(SOULS_DIR)) await mkdir(SOULS_DIR, { recursive: true });

    // Create test agent soul
    await writeFile(join(SOULS_DIR, `${TEST_AGENT_NAME}.md`), "# Test Agent Soul\nOriginal instructions.");
  };

  const teardownTestEnv = async () => {
    if (existsSync(GHOST_LOGS_DIR)) await rm(GHOST_LOGS_DIR, { recursive: true, force: true });
    if (existsSync(PROPOSALS_DIR)) await rm(PROPOSALS_DIR, { recursive: true, force: true });

    const soulPath = join(SOULS_DIR, `${TEST_AGENT_NAME}.md`);
    if (existsSync(soulPath)) await rm(soulPath);
  };

  beforeAll(async () => {
    await setupTestEnv();
  });

  afterAll(async () => {
    await teardownTestEnv();
  });

  it('analyze_agent_logs should identify patterns', async () => {
    const analyzeTool = tools.find(t => t.name === "analyze_agent_logs")!;

    // Create dummy logs
    const now = Date.now();
    const log1 = { status: "failed", errorMessage: "Timeout error", timestamp: now - 1000 };
    const log2 = { status: "failed", errorMessage: "Timeout error", timestamp: now - 2000 };
    const log3 = { status: "success", timestamp: now - 3000 };

    await writeFile(join(GHOST_LOGS_DIR, `${now}_1.json`), JSON.stringify(log1));
    await writeFile(join(GHOST_LOGS_DIR, `${now}_2.json`), JSON.stringify(log2));
    await writeFile(join(GHOST_LOGS_DIR, `${now}_3.json`), JSON.stringify(log3));

    const result: any = await analyzeTool.execute({ agent_name: TEST_AGENT_NAME, timeframe_hours: 1 });
    const output = result.content[0].text;

    expect(output).toContain("Total Failures: 2");
    expect(output).toContain("Timeout error");
    expect(output).toContain("Success Rate: 33%");
  });

  it('suggest_agent_improvement should create a proposal', async () => {
    const suggestTool = tools.find(t => t.name === "suggest_agent_improvement")!;

    const result: any = await suggestTool.execute({
      agent_name: TEST_AGENT_NAME,
      title: "Fix Timeout",
      description: "Increase timeout to 60s",
      changes: "## Performance\n- Set timeout to 60s"
    });

    const output = result.content[0].text;
    expect(output).toContain("Proposal created with ID:");

    // Verify file exists
    const match = output.match(/ID: (prop-[^.]+)/);
    const proposalId = match[1];

    const proposalPath = join(PROPOSALS_DIR, `${proposalId}.json`);
    const exists = existsSync(proposalPath);
    expect(exists).toBe(true);

    const content = JSON.parse(await readFile(proposalPath, 'utf-8'));
    expect(content.agent_name).toBe(TEST_AGENT_NAME);
    expect(content.status).toBe("pending");
  });

  it('update_agent_soul should fail without approval', async () => {
    // Re-create a proposal
    const suggestTool = tools.find(t => t.name === "suggest_agent_improvement")!;
    const result: any = await suggestTool.execute({
        agent_name: TEST_AGENT_NAME,
        title: "Test Update",
        description: "Test",
        changes: "Changes"
    });
    const proposalId = result.content[0].text.match(/ID: (prop-[\w-]+)/)[1];

    const updateTool = tools.find(t => t.name === "update_agent_soul")!;
    const updateResult: any = await updateTool.execute({ proposal_id: proposalId });

    expect(updateResult.isError).toBe(true);
    expect(updateResult.content[0].text).toContain("not approved");
  });

  it('update_agent_soul should succeed with approval', async () => {
    // Create proposal
    const suggestTool = tools.find(t => t.name === "suggest_agent_improvement")!;
    const result: any = await suggestTool.execute({
        agent_name: TEST_AGENT_NAME,
        title: "Approved Update",
        description: "Test",
        changes: "\n- Approved change"
    });
    const proposalId = result.content[0].text.match(/ID: (prop-[\w-]+)/)[1];

    // Approve it (create .approved file)
    await writeFile(join(PROPOSALS_DIR, `${proposalId}.approved`), "");

    // Update
    const updateTool = tools.find(t => t.name === "update_agent_soul")!;
    const updateResult: any = await updateTool.execute({ proposal_id: proposalId });

    expect(updateResult.content[0].text).toContain("Successfully updated");

    // Verify Soul
    const soulContent = await readFile(join(SOULS_DIR, `${TEST_AGENT_NAME}.md`), 'utf-8');
    expect(soulContent).toContain("Approved change");

    // Verify Proposal Status
    const proposalContent = JSON.parse(await readFile(join(PROPOSALS_DIR, `${proposalId}.json`), 'utf-8'));
    expect(proposalContent.status).toBe("applied");
  });

});
