import { test, mock, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Persona Integration with Autonomous Agents', () => {
  let transformMock: any;

  beforeEach(() => {
    transformMock = mock.fn(async (text: string) => `[Persona] ${text}`);

    mock.module('../../src/persona/middleware.js', {
      namedExports: {
        PersonaMiddleware: class MockPersonaMiddleware {
          async transform(text: string, onTyping?: any, context?: any, simulateLatency?: boolean) {
            return transformMock(text, onTyping, context, simulateLatency);
          }
        }
      }
    });

    // Also mock MCP to avoid connecting to real servers
    mock.module('../../src/mcp.js', {
        namedExports: {
            MCP: class MockMCP {
                async init() {}
                listServers() { return []; }
                async startServer() {}
                getClient() {
                    return {
                        callTool: async () => ({ content: [] })
                    }
                }
            }
        }
    });

    // Mock trigger
    mock.module('../../src/scheduler/trigger.js', {
        namedExports: {
            handleTaskTrigger: async () => ({ exitCode: 0 })
        }
    });
  });

  afterEach(() => {
    mock.reset();
  });

  it('ReviewerAgent should apply persona to feedback without latency', async () => {
    const { ReviewerAgent } = await import('../../src/agents/reviewer_agent.js');
    const agent = new ReviewerAgent();

    const result = await agent.reviewTask({ id: 'test', name: 'test', trigger: 'cron', prompt: 'test' });

    assert.ok(result.feedback.includes('[Persona]'), 'Feedback should be transformed');

    const calls = transformMock.mock.calls;
    assert.strictEqual(calls.length, 1);
    const args = calls[0].arguments;
    // args: [text, onTyping, context, simulateLatency]
    assert.strictEqual(args[2], 'response', 'Context should be response');
    assert.strictEqual(args[3], false, 'Simulate latency should be false');
  });

  it('JobDelegator should apply persona to logs without latency', async () => {
    const { JobDelegator } = await import('../../src/scheduler/job_delegator.js');
    const delegator = new JobDelegator('/tmp/test-agent');

    // Mock console.log to suppress output
    const consoleLog = mock.method(console, 'log', () => {});

    await delegator.delegateTask({ id: 'test', name: 'test-task', trigger: 'cron', prompt: 'test' });

    const calls = transformMock.mock.calls;
    assert.ok(calls.length >= 2, 'Should transform start and end logs');

    // Check start log
    const startLog = calls.find((c: any) => c.arguments[0].includes('Starting task'));
    assert.ok(startLog, 'Start log should be transformed');
    assert.strictEqual(startLog.arguments[3], false, 'Start log latency should be false');

    // Check end log (summary)
    const endLog = calls.find((c: any) => c.arguments[0].includes('Task completed'));
    assert.ok(endLog, 'End log should be transformed');
    assert.strictEqual(endLog.arguments[3], false, 'End log latency should be false');
  });
});
