import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextServer } from '../src/mcp_servers/context_server.js';
import fs from 'fs/promises';
import { join } from 'path';

// Mock MCP
const mockCallTool = vi.fn();
const mockGetClient = vi.fn();
const mockStartServer = vi.fn();
const mockInit = vi.fn();

vi.mock('../src/mcp.js', () => {
  return {
    MCP: vi.fn().mockImplementation(() => {
      return {
        init: mockInit,
        getClient: mockGetClient,
        startServer: mockStartServer,
      };
    }),
  };
});

// Mock proper-lockfile with a simple mutex to simulate serialization
vi.mock('proper-lockfile', () => {
  let lockQueue = Promise.resolve();
  return {
    lock: vi.fn().mockImplementation(async () => {
      // Chain the lock acquisition to the queue
      // We need to capture the current tail of the queue
      const previousLock = lockQueue;

      let releaseResolver: () => void;
      const releasePromise = new Promise<void>(resolve => { releaseResolver = resolve; });

      // Update queue to verify the new lock is held until released
      lockQueue = previousLock.then(() => releasePromise);

      // Wait for previous locks to release
      await previousLock;

      return async () => {
          releaseResolver();
      };
    }),
  };
});

describe('ContextServer Integration with Brain', () => {
  let server: ContextServer;
  const testCwd = process.cwd();
  const contextFile = join(testCwd, '.agent', 'context.json');

  beforeEach(async () => {
    vi.clearAllMocks();
    // Resetting lockQueue inside the mock isn't easily possible without exposing it.
    // However, since we wait for previous locks, it should be fine as long as they resolve.

    server = new ContextServer(testCwd);

    // Setup default mocks: client exists
    mockGetClient.mockReturnValue({
      callTool: mockCallTool,
      listTools: vi.fn().mockResolvedValue({ tools: [] })
    });

    // Clean up local file
    try {
      await fs.unlink(contextFile);
    } catch {}
    try {
        await fs.mkdir(join(testCwd, '.agent'), { recursive: true });
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.unlink(contextFile);
    } catch {}
  });

  it('should fallback to local file if Brain is unavailable', async () => {
    // Mock Brain unavailable
    mockGetClient.mockReturnValue(undefined);
    mockStartServer.mockRejectedValue(new Error("Brain not found"));

    // Write local file
    const localData = { goals: ["local goal"] };
    await fs.writeFile(contextFile, JSON.stringify(localData));

    const result = await server.readContext();
    expect(result.goals).toEqual(["local goal"]);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('should prioritize Brain memory over local file', async () => {
    const brainData = { goals: ["brain goal"] };
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ value: JSON.stringify(brainData) }) }],
      isError: false
    });

    const localData = { goals: ["local goal"] };
    await fs.writeFile(contextFile, JSON.stringify(localData));

    const result = await server.readContext();
    expect(result.goals).toEqual(["brain goal"]);
    expect(mockCallTool).toHaveBeenCalledWith({
      name: "recall_memory",
      arguments: { key: `project:${encodeURIComponent(testCwd)}:context` }
    });
  });

  it('should store to both Brain and local file on update', async () => {
    const updates = { goals: ["new goal"] };

    // Mock Brain recall (empty)
    mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Memory not found." }],
        isError: true
    });

    // Mock Brain store
    mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Memory stored." }]
    });

    await server.updateContext(updates);

    const fileContent = JSON.parse(await fs.readFile(contextFile, 'utf-8'));
    expect(fileContent.goals).toEqual(["new goal"]);

    expect(mockCallTool).toHaveBeenCalledTimes(2);
    expect(mockCallTool).toHaveBeenLastCalledWith({
      name: "store_memory",
      arguments: expect.objectContaining({
        key: `project:${encodeURIComponent(testCwd)}:context`,
        value: expect.stringContaining("new goal"),
        metadata: expect.anything()
      })
    });
  });

  it('should deduplicate goals and constraints', async () => {
    mockCallTool.mockResolvedValue({ isError: true, content: [] }); // Read
    // Mock store to succeed
    mockCallTool.mockImplementation(async (args) => {
        if (args.name === 'store_memory') return { content: [] };
        return { isError: true };
    });

    await server.updateContext({ goals: ["g1", "g1"], constraints: ["c1", "c1"] });

    const fileContent = JSON.parse(await fs.readFile(contextFile, 'utf-8'));
    expect(fileContent.goals).toEqual(["g1"]);
    expect(fileContent.constraints).toEqual(["c1"]);
  });

  it('should limit recent_changes to 10', async () => {
    mockCallTool.mockResolvedValue({ isError: true, content: [] });
    mockCallTool.mockImplementation(async (args) => {
        if (args.name === 'store_memory') return { content: [] };
        return { isError: true };
    });

    const manyChanges = Array.from({ length: 15 }, (_, i) => `change ${i}`);
    await server.updateContext({ recent_changes: manyChanges });

    const fileContent = JSON.parse(await fs.readFile(contextFile, 'utf-8'));
    expect(fileContent.recent_changes).toHaveLength(10);
    expect(fileContent.recent_changes[0]).toBe("change 5"); // last 10
    expect(fileContent.recent_changes[9]).toBe("change 14");
  });

  it('should handle concurrent updates correctly (race condition test)', async () => {
    // Initial state
    let currentBrainState: any = { working_memory: "Initial" };

    mockCallTool.mockImplementation(async (args: any) => {
        // Simulate delay
        await new Promise(r => setTimeout(r, 10));

        if (args.name === "recall_memory") {
            return {
                content: [{ type: "text", text: JSON.stringify({ value: JSON.stringify(currentBrainState) }) }]
            };
        }
        if (args.name === "store_memory") {
            const val = JSON.parse(args.arguments.value);
            currentBrainState = val;
            return { content: [{ type: "text", text: "Stored" }] };
        }
    });

    // Run concurrently
    await Promise.all([
        server.updateContext({ working_memory: "Update A" }),
        server.updateContext({ active_tasks: ["Task B"] })
    ]);

    // Verify final state
    // Because of the lock mock, these should be serialized.
    // The second one should see the update from the first one.
    // Final state should have BOTH changes.
    const finalState = currentBrainState;
    expect(finalState.working_memory).toBe("Update A");
    expect(finalState.active_tasks).toEqual(["Task B"]);
  });

  it('should measure context size (token savings proxy)', async () => {
      const data = {
          goals: ["goal 1", "goal 2"],
          constraints: ["constraint 1"],
          recent_changes: [],
          active_tasks: [],
          working_memory: "some memory",
          company_context: "company info"
      };

      const json = JSON.stringify(data);
      console.log(`Context JSON Size: ${json.length} bytes (approx ${Math.ceil(json.length / 4)} tokens)`);

      // Mock Brain return
      mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({ value: json }) }],
          isError: false
      });

      const result = await server.readContext();
      expect(result.goals).toHaveLength(2);
  });
});
