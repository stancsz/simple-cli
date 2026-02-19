import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwarmManager } from "../../src/mcp_servers/agent_swarm/manager.js";
import { AgentSwarmServer } from "../../src/mcp_servers/agent_swarm/index.js";

// Mocks
const mockSpawn = vi.fn();
const mockReadFile = vi.fn();
const mockWrite = vi.fn();
const mockKill = vi.fn();

// Store event listeners to trigger them later
let childProcessListeners: Record<string, Function> = {};

vi.mock("child_process", () => ({
  spawn: (...args: any[]) => {
    mockSpawn(...args);
    childProcessListeners = {};
    return {
      pid: 12345,
      stdin: { write: mockWrite, end: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (event: string, cb: Function) => {
        childProcessListeners[event] = cb;
      },
      kill: mockKill
    };
  }
}));

vi.mock("fs/promises", () => ({
  readFile: (...args: any[]) => mockReadFile(...args)
}));

// Mock McpServer to avoid actual server startup/stdio issues
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor() {}
    tool() {}
    connect() {}
  }
}));

describe("SwarmManager", () => {
  let manager: SwarmManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SwarmManager();
    mockReadFile.mockResolvedValue(JSON.stringify({
      swarmCapableAgents: {
        "test-agent": {
          command: "echo",
          args: ["hello"],
          description: "A test agent",
          env: { TEST: "true" },
          supports_stdin: true
        }
      }
    }));
  });

  it("should list available agents", async () => {
    const agents = await manager.listAgents();
    expect(agents).toHaveProperty("test-agent");
    expect(agents["test-agent"].command).toBe("echo");
  });

  it("should spawn an agent", async () => {
    const result = await manager.spawn({
      agent_type: "test-agent",
      role_description: "Tester",
      initial_context: "ctx-123"
    });

    expect(mockSpawn).toHaveBeenCalled();
    expect(result.pid).toBe(12345);
    expect(manager.getActiveAgents()).toHaveLength(1);
    expect(manager.getActiveAgents()[0].id).toBe(result.swarm_agent_id);

    // Check environment injection
    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[2].env.JULES_CONTEXT_ID).toBe("ctx-123");
    expect(spawnArgs[2].env.JULES_ROLE).toBe("Tester");
  });

  it("should write to stdin if context is provided and supported", async () => {
    await manager.spawn({
      agent_type: "test-agent",
      role_description: "Tester",
      initial_context: "Provide a summary"
    });

    expect(mockWrite).toHaveBeenCalled();
    const writeArgs = mockWrite.mock.calls[0][0];
    expect(writeArgs).toContain("Context: Provide a summary");
  });

  it("should fail to spawn unknown agent", async () => {
    await expect(manager.spawn({
      agent_type: "unknown",
      role_description: "x",
      initial_context: "x"
    })).rejects.toThrow("Unknown agent type");
  });

  it("should terminate an agent", async () => {
     const result = await manager.spawn({
      agent_type: "test-agent",
      role_description: "Tester",
      initial_context: "ctx-123"
    });

    const success = await manager.terminate(result.swarm_agent_id);
    expect(success).toBe(true);
    expect(mockKill).toHaveBeenCalled();

    expect(manager.getAgent(result.swarm_agent_id)?.status).toBe('terminated');
  });

  it("should handle agent exit", async () => {
    const result = await manager.spawn({
      agent_type: "test-agent",
      role_description: "Tester",
      initial_context: "ctx-123"
    });

    expect(manager.getAgent(result.swarm_agent_id)?.status).toBe('active');

    // Simulate exit
    if (childProcessListeners['exit']) {
      childProcessListeners['exit'](0);
    }

    expect(manager.getAgent(result.swarm_agent_id)?.status).toBe('terminated');
  });

  it("should handle agent failure", async () => {
    const result = await manager.spawn({
      agent_type: "test-agent",
      role_description: "Tester",
      initial_context: "ctx-123"
    });

    // Simulate failure exit
    if (childProcessListeners['exit']) {
      childProcessListeners['exit'](1);
    }

    expect(manager.getAgent(result.swarm_agent_id)?.status).toBe('failed');
  });
});

describe("AgentSwarmServer", () => {
  it("should instantiate correctly", () => {
    const server = new AgentSwarmServer();
    expect(server).toBeDefined();
  });
});
