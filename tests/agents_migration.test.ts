import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MCP } from "../src/mcp";
import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
    }
  };
});

// Mock fs/promises
vi.mock("fs/promises", () => {
  return {
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
  };
});

describe("MCP Agents Migration", () => {
  let mcp: MCP;

  beforeEach(() => {
    vi.resetAllMocks();
    mcp = new MCP();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should load agents from mcp.json", async () => {
    const mockConfig = {
      agents: {
        test_agent: {
          command: "echo",
          args: ["hello"],
          description: "A test agent"
        }
      }
    };

    (existsSync as any).mockImplementation((path: string) => {
        if (path.includes("mcp.json")) return true;
        if (path.includes("mcp_servers")) return true;
        return false;
    });

    (readFileSync as any).mockImplementation((path: string) => {
         if (path.includes("mcp.json")) return JSON.stringify(mockConfig);
         return "";
    });

    await mcp.init();

    const tools: any[] = await mcp.getTools();
    const agentTool = tools.find((t: any) => t.name === "test_agent");

    expect(agentTool).toBeDefined();
    expect(agentTool.description).toBe("A test agent");
  });

  it("should not have delegate_cli tool", async () => {
    (existsSync as any).mockReturnValue(false);
    await mcp.init();
    const tools: any[] = await mcp.getTools();
    const delegateTool = tools.find((t: any) => t.name === "delegate_cli");
    expect(delegateTool).toBeUndefined();
  });

  it("should execute agent tool with correct args", async () => {
     const mockConfig = {
      agents: {
        echo_agent: {
          command: "echo",
          args: ["prefix"],
          description: "Echo agent"
        }
      }
    };

    (existsSync as any).mockImplementation((path: string) => {
        if (path.includes("mcp.json")) return true;
        return false;
    });
    (readFileSync as any).mockReturnValue(JSON.stringify(mockConfig));

    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

    // Setup mock process
    const mockStdoutOn = vi.fn();
    const mockStderrOn = vi.fn();
    const mockProcOn = vi.fn();

    const mockProc = {
        stdout: { on: mockStdoutOn },
        stderr: { on: mockStderrOn },
        on: mockProcOn,
        pid: 123
    };
    mockSpawn.mockReturnValue(mockProc);

    await mcp.init();
    const tools: any[] = await mcp.getTools();
    const tool = tools.find((t: any) => t.name === "echo_agent");

    // Execute tool
    const executionPromise = tool.execute({ args: ["suffix"] });

    // Simulate process events
    const stdoutCallback = mockStdoutOn.mock.calls.find(call => call[0] === 'data')?.[1];
    if (stdoutCallback) stdoutCallback("output");

    const closeCallback = mockProcOn.mock.calls.find(call => call[0] === 'close')?.[1];
    if (closeCallback) closeCallback(0);

    const result = await executionPromise;

    expect(mockSpawn).toHaveBeenCalledWith(
        "echo",
        ["prefix", "suffix"],
        expect.objectContaining({ env: expect.any(Object), shell: false })
    );
    expect(result).toContain("output");
  });

  it("should support stdin if configured", async () => {
     const mockConfig = {
      agents: {
        stdin_agent: {
          command: "cat",
          args: [],
          description: "Cat agent",
          supports_stdin: true
        }
      }
    };

    (existsSync as any).mockReturnValue(true);
    (readFileSync as any).mockReturnValue(JSON.stringify(mockConfig));

    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

    // Setup mock process with stdin
    const mockStdinWrite = vi.fn();
    const mockStdinEnd = vi.fn();
    const mockProc = {
        stdin: { write: mockStdinWrite, end: mockStdinEnd },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
             if (event === "close") cb(0);
        }),
        pid: 124
    };
    mockSpawn.mockReturnValue(mockProc);

    await mcp.init();
    const tools: any[] = await mcp.getTools();
    const tool = tools.find((t: any) => t.name === "stdin_agent");

    expect(tool.inputSchema.properties.input).toBeDefined();

    await tool.execute({ args: [], input: "hello world" });

    expect(mockStdinWrite).toHaveBeenCalledWith("hello world");
    expect(mockStdinEnd).toHaveBeenCalled();
  });
});
