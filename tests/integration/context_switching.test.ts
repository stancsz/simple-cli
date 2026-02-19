import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextManager } from "../../src/context/ContextManager.js";
import { MCP } from "../../src/mcp.js";
import { ContextServer } from "../../src/mcp_servers/context_server.js";

// Mock MCP
vi.mock("../../src/mcp.js", () => {
  return {
    MCP: vi.fn().mockImplementation(() => ({
      getClient: vi.fn(),
    })),
  };
});

// Mock ContextServer
vi.mock("../../src/mcp_servers/context_server.js", () => {
  return {
    ContextServer: vi.fn().mockImplementation(() => ({
      readContext: vi.fn().mockResolvedValue({}),
      updateContext: vi.fn().mockResolvedValue({}),
      clearContext: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe("ContextManager Switching Integration", () => {
  let contextManager: ContextManager;
  let mockMcp: any;
  let mockClient: any;
  let mockContextServer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMcp = new MCP();
    mockClient = {
      callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    };
    mockMcp.getClient.mockImplementation((name: string) => {
        if (name === "company_context") return mockClient;
        if (name === "brain") return { callTool: vi.fn().mockResolvedValue({}) }; // Mock brain client too
        return null;
    });

    contextManager = new ContextManager(mockMcp);
    // Access mocked ContextServer instance
    mockContextServer = (contextManager as any).server;
  });

  it("should call switch_company_context tool and update activeCompany", async () => {
    const companyId = "client-a";
    await contextManager.switchCompany(companyId);

    expect(mockMcp.getClient).toHaveBeenCalledWith("company_context");
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: "switch_company_context",
      arguments: { company_id: companyId },
    });

    expect((contextManager as any).activeCompany).toBe(companyId);
  });

  it("should throw error if switch_company_context fails", async () => {
    mockClient.callTool.mockResolvedValue({
      content: [{ text: "Failed to switch" }],
      isError: true,
    });

    await expect(contextManager.switchCompany("client-b")).rejects.toThrow("Failed to switch");
  });

  it("should use activeCompany for loadContext calls", async () => {
    const companyId = "client-c";
    await contextManager.switchCompany(companyId);

    await contextManager.loadContext("task");

    // Verify ContextServer.readContext called with correct company
    expect(mockContextServer.readContext).toHaveBeenCalledWith(undefined, companyId);
  });

  it("should fallback to env var if activeCompany is not set", async () => {
      process.env.JULES_COMPANY = "env-company";
      // Ensure activeCompany is null
      (contextManager as any).activeCompany = null;

      await contextManager.loadContext("task");

      expect(mockContextServer.readContext).toHaveBeenCalledWith(undefined, "env-company");

      delete process.env.JULES_COMPANY;
  });
});
