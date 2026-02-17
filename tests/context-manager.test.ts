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

// Mock proper-lockfile to avoid actual file locking issues in tests
vi.mock('proper-lockfile', () => {
  return {
    lock: vi.fn().mockResolvedValue(async () => {}),
  };
});

describe('ContextServer Integration with Brain', () => {
  let server: ContextServer;
  const testCwd = process.cwd();
  const contextFile = join(testCwd, '.agent', 'context.json');

  beforeEach(async () => {
    vi.clearAllMocks();
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
    // Should verify Brain was not called (because client was undefined)
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('should prioritize Brain memory over local file', async () => {
    // Mock Brain returns data
    const brainData = { goals: ["brain goal"] };
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ value: JSON.stringify(brainData) }) }],
      isError: false
    });

    // Write local file with different data
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

    // Mock Brain recall (empty or existing) - simulate "not found" or empty so we fall back to local/empty
    mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Memory not found." }],
        isError: true
    });

    // Mock Brain store
    mockCallTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Memory stored." }]
    });

    await server.updateContext(updates);

    // Verify local file
    const fileContent = JSON.parse(await fs.readFile(contextFile, 'utf-8'));
    expect(fileContent.goals).toEqual(["new goal"]);

    // Verify Brain store call
    // First call was recall, second call is store
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

  it('should measure context size', async () => {
      const data = {
          goals: ["goal 1", "goal 2"],
          constraints: ["constraint 1"],
          recent_changes: [],
          active_tasks: [],
          working_memory: "some memory",
          company_context: "company info"
      };

      const json = JSON.stringify(data);
      console.log(`Context JSON Size: ${json.length} bytes`);

      // Mock Brain return
      mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({ value: json }) }],
          isError: false
      });

      const result = await server.readContext();
      expect(result.goals).toHaveLength(2);
  });
});
