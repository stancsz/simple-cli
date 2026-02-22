import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StagehandServer } from "../../src/mcp_servers/desktop/stagehand.js";

// Mock dependencies
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class {
      tool(name: string, description: string, schema: any, handler: any) {
        (this as any).tools = (this as any).tools || {};
        (this as any).tools[name] = handler;
      }
      async connect(transport: any) {}
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: class {},
  };
});

// Mock Stagehand
const mockPage = {
  goto: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
  textContent: vi.fn(),
  evaluate: vi.fn(),
  setViewportSize: vi.fn(),
};

const mockStagehandInstance = {
  init: vi.fn(),
  page: mockPage,
  close: vi.fn(),
};

vi.mock("@browserbasehq/stagehand", () => {
  return {
    Stagehand: vi.fn(() => mockStagehandInstance),
  };
});

describe("Stagehand Integration", () => {
  let server: StagehandServer;
  let mcpServerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new StagehandServer();
    mcpServerInstance = (server as any).server;
  });

  it("should register all desktop tools", () => {
    const tools = Object.keys(mcpServerInstance.tools);
    expect(tools).toContain("desktop_navigate");
    expect(tools).toContain("desktop_click");
    expect(tools).toContain("desktop_type");
    expect(tools).toContain("desktop_screenshot");
    expect(tools).toContain("desktop_extract");
    expect(tools).toContain("desktop_shutdown");
  });

  it("should initialize Stagehand on first tool call", async () => {
    const navigate = mcpServerInstance.tools["desktop_navigate"];
    await navigate({ url: "https://example.com" });

    expect(mockStagehandInstance.init).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  it("should handle navigation errors", async () => {
    mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));
    const navigate = mcpServerInstance.tools["desktop_navigate"];
    const result = await navigate({ url: "https://fail.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Navigation failed");
  });

  it("should execute click command", async () => {
    const click = mcpServerInstance.tools["desktop_click"];
    await click({ selector: "#btn" });

    expect(mockPage.click).toHaveBeenCalledWith("#btn");
  });

  it("should execute type command", async () => {
    const type = mcpServerInstance.tools["desktop_type"];
    await type({ selector: "#input", text: "hello" });

    expect(mockPage.fill).toHaveBeenCalledWith("#input", "hello");
  });

  it("should execute screenshot command", async () => {
    const screenshot = mcpServerInstance.tools["desktop_screenshot"];
    const result = await screenshot({});

    expect(mockPage.screenshot).toHaveBeenCalled();
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].data).toBe(Buffer.from("fake-screenshot").toString("base64"));
  });

  it("should execute extract command with selector", async () => {
    mockPage.textContent.mockResolvedValue("Extracted Text");
    const extract = mcpServerInstance.tools["desktop_extract"];
    const result = await extract({ selector: ".content" });

    expect(mockPage.textContent).toHaveBeenCalledWith(".content");
    expect(result.content[0].text).toBe("Extracted Text");
  });

  it("should execute extract command without selector (full page)", async () => {
    mockPage.evaluate.mockResolvedValue("Full Page Text");
    const extract = mcpServerInstance.tools["desktop_extract"];
    const result = await extract({});

    expect(mockPage.evaluate).toHaveBeenCalled();
    expect(result.content[0].text).toBe("Full Page Text");
  });

  it("should handle shutdown", async () => {
    // Ensure initialized
    const navigate = mcpServerInstance.tools["desktop_navigate"];
    await navigate({ url: "https://example.com" });

    const shutdown = mcpServerInstance.tools["desktop_shutdown"];
    await shutdown({});

    expect(mockStagehandInstance.close).toHaveBeenCalled();
  });
});
