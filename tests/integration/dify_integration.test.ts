import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DifyServer } from '../../src/mcp_servers/dify/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

describe('Dify Local Orchestration Integration', () => {
  let server: DifyServer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    // Mock fetch globally
    global.fetch = vi.fn();

    // Instantiate server for each test
    server = new DifyServer();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('validates docker-compose configuration exists', () => {
    const dockerComposePath = path.join(REPO_ROOT, 'docker-compose.dify.yml');
    expect(fs.existsSync(dockerComposePath)).toBe(true);

    const content = fs.readFileSync(dockerComposePath, 'utf-8');
    expect(content).toContain('dify-api:');
    expect(content).toContain('dify-worker:');
    expect(content).toContain('dify-web:');
    expect(content).toContain('dify-db:');
    expect(content).toContain('dify-redis:');
  });

  it('validates agent templates are valid JSON and have required fields', () => {
    const templatesDir = path.join(REPO_ROOT, 'dify_agent_templates');
    expect(fs.existsSync(templatesDir)).toBe(true);

    const supervisorPath = path.join(templatesDir, 'supervisor_agent.json');
    const codingAgentPath = path.join(templatesDir, 'coding_agent.json');

    expect(fs.existsSync(supervisorPath)).toBe(true);
    expect(fs.existsSync(codingAgentPath)).toBe(true);

    const supervisor = JSON.parse(fs.readFileSync(supervisorPath, 'utf-8'));
    expect(supervisor.app.name).toBe('Supervisor Agent');
    expect(supervisor.model_config.provider).toBe('anthropic');

    const codingAgent = JSON.parse(fs.readFileSync(codingAgentPath, 'utf-8'));
    expect(codingAgent.app.name).toBe('Coding Agent');
    expect(codingAgent.model_config.provider).toBe('deepseek');
  });

  it('verifies Dify API accessibility (simulated)', async () => {
    process.env.DIFY_API_KEY = 'test-api-key';
    process.env.DIFY_API_URL = 'http://localhost:5001/v1';

    const mockResponse = {
      answer: "Dify is online.",
      conversation_id: "test-conv-id"
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await server.runChat("Status check", "test-user");

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5001/v1/chat-messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('"query":"Status check"')
      })
    );

    expect(result).toEqual({
      content: [
        { type: 'text', text: "Dify is online." },
        { type: 'text', text: "Conversation ID: test-conv-id" }
      ]
    });
  });

  it('simulates Supervisor -> Coding Agent workflow via mocked API', async () => {
    process.env.DIFY_API_KEY = 'test-api-key';
    process.env.DIFY_API_URL = 'http://localhost:5001/v1';

    // Mock sequence of responses
    const supervisorPlan = "Plan: 1. Write hello world python script.";
    const codingResponse = "Here is the code: print('Hello World')";

    (global.fetch as any)
      .mockResolvedValueOnce({ // Supervisor response
        ok: true,
        json: async () => ({
          answer: supervisorPlan,
          conversation_id: "sup-conv-1"
        })
      })
      .mockResolvedValueOnce({ // Coding Agent response
        ok: true,
        json: async () => ({
          answer: codingResponse,
          conversation_id: "code-conv-1"
        })
      });

    // Step 1: Supervisor
    console.log("Simulating Supervisor Agent request...");
    const step1 = await server.runChat("Create a python hello world script", "user-1");
    expect(step1.content[0].text).toBe(supervisorPlan);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Step 2: Coding Agent (Delegation)
    // In a real scenario, the orchestration logic would parse step1 and call step2.
    // Here we simulate the orchestrator passing the plan to the next agent (or the same endpoint if using a Router).
    // Assuming we use the same Dify endpoint but maybe different inputs or context in a real app.
    // For this test, we just verify the round trip.

    console.log("Simulating Coding Agent request...");
    const step2 = await server.runChat(supervisorPlan, "user-1", "sup-conv-1");
    expect(step2.content[0].text).toBe(codingResponse);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Verify conversation ID usage in step 2
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"conversation_id":"sup-conv-1"')
      })
    );
  });
});
