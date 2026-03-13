import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { BrainServer } from '../../src/mcp_servers/brain/index.js';
import fs from 'fs';
import path from 'path';

// Mock LLM so we don't hit the real API in tests
vi.mock('../../src/llm.js', () => {
  class MockLLM {
    async generate(systemPrompt: string, history: any[]) {
      return {
        message: JSON.stringify({
          common_successes: ['Successfully mocked LLM response'],
          recurring_failures: ['None'],
          meta_recommendation: 'Use mocks during tests'
        })
      };
    }
    async embed(text: string) {
        return new Array(1536).fill(0.1);
    }
  }
  return {
    LLM: MockLLM,
    createLLM: () => new MockLLM()
  };
});

describe('cross_agency_pattern_analysis integration', () => {
  let brainServer: any;
  let episodic: EpisodicMemory;
  const testDir = path.join(process.cwd(), '.agent', 'test_brain_pattern_analysis');

  beforeAll(async () => {
    // Create a fresh directory for EpisodicMemory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Set JULES_AGENT_DIR so BrainServer uses the test directory
    process.env.JULES_AGENT_DIR = path.join(testDir, 'agent');

    // Create a standalone instance of EpisodicMemory to seed data directly
    episodic = new EpisodicMemory(testDir);
    await episodic.init();

    // Start Brain Server
    brainServer = new BrainServer();
  });

  afterAll(async () => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  const callTool = async (name: string, args: any) => {
    const toolMap = brainServer.server._registeredTools || brainServer.server.tools || brainServer.server._tools;
    let toolDef;
    if (toolMap instanceof Map) {
       toolDef = toolMap.get(name);
    } else {
       toolDef = toolMap[name] || Object.values(toolMap).find((t: any) => t.name === name);
    }

    if (!toolDef) throw new Error(`Tool ${name} not found`);

    if (toolDef.handler) {
       return toolDef.handler(args, {});
    }
    throw new Error(`Tool ${name} has no handler`);
  };

  it('verifies the cross_agency_pattern_recognition tool is accessible via the Brain MCP server', async () => {
    const toolMap = brainServer.server._registeredTools || brainServer.server.tools || brainServer.server._tools;
    let toolDef;
    if (toolMap instanceof Map) {
       toolDef = toolMap.get('cross_agency_pattern_recognition');
    } else {
       toolDef = toolMap['cross_agency_pattern_recognition'] || Object.values(toolMap).find((t: any) => t.name === 'cross_agency_pattern_recognition');
    }
    expect(toolDef).toBeDefined();
    expect(toolDef.name || 'cross_agency_pattern_recognition').toBe('cross_agency_pattern_recognition');
  });

  it('aggregates memories across agency namespaces, synthesizes with LLM, and stores meta-analysis', async () => {
    const topic = "integration_test_pattern";

    episodic.recall = vi.fn().mockImplementation(async (query: string, limit: number, namespace: string) => {
      if (query !== topic) return [];

      if (namespace === 'test_agency_1') {
        return [{
          taskId: 'task_1',
          query: topic,
          solution: 'Outcome: success.',
          agentResponse: 'Success',
          timestamp: Date.now()
        }];
      } else if (namespace === 'test_agency_2') {
        return [{
          taskId: 'task_2',
          query: topic,
          solution: 'Outcome: failure.',
          agentResponse: 'Failure',
          timestamp: Date.now()
        }];
      }
      return [];
    });

    const storeSpy = vi.spyOn(episodic, 'store');

    brainServer.episodic = episodic;

    // 2. Invoke the tool via the MCP server interface directly
    const response = await callTool("cross_agency_pattern_recognition", {
      topic: topic,
      agency_namespaces: ["test_agency_1", "test_agency_2"]
    });

    // 3. Validate Tool Output
    expect(response).toBeDefined();
    if (response.isError) {
        console.error("Tool returned error:", response.content);
    }
    expect(response.isError).toBeUndefined(); // Some SDK versions don't return isError: false, they just omit it

    const content = JSON.parse(response.content[0].text);

    expect(content.summary).toContain(`Identified 2 cross-agency experiences regarding '${topic}'. Meta-recommendation generated.`);
    expect(content.synthesis.common_successes).toContain('Successfully mocked LLM response');
    expect(content.synthesis.meta_recommendation).toBe('Use mocks during tests');
    expect(content.details.length).toBe(2);

    // 4. Validate that the pattern was stored back into EpisodicMemory
    expect(storeSpy).toHaveBeenCalledTimes(1);
    const storeArgs = storeSpy.mock.calls[0];

    expect(storeArgs[0]).toMatch(/^meta_analysis_\d+$/);
    expect(storeArgs[1]).toBe(`Cross-agency pattern analysis for topic: ${topic}`);
    expect(storeArgs[11]).toBe("cross_agency_pattern");

    const storedSynthesis = JSON.parse(storeArgs[2] as string);
    expect(storedSynthesis.common_successes).toContain('Successfully mocked LLM response');

    storeSpy.mockRestore();
  });
});
