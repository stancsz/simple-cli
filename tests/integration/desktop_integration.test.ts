import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTools } from "../../src/mcp_servers/desktop/tools.js";
import { DesktopBackend } from "../../src/mcp_servers/desktop/interfaces/DesktopBackend.js";

// Mock Backend
const mockBackend: DesktopBackend = {
  init: vi.fn(),
  navigate_to: vi.fn().mockResolvedValue("Navigated to https://example.com"),
  click_element: vi.fn().mockResolvedValue("Clicked #btn"),
  type_text: vi.fn().mockResolvedValue("Typed hello"),
  take_screenshot: vi.fn().mockResolvedValue("fake-base64-image"),
  extract_page_text: vi.fn().mockResolvedValue("Page content"),
  shutdown: vi.fn(),
};

describe("Desktop Orchestration Integration", () => {
  let tools: ReturnType<typeof createTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createTools(mockBackend);
  });

  it("should define all required tools", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("navigate_to");
    expect(toolNames).toContain("click_element");
    expect(toolNames).toContain("type_text");
    expect(toolNames).toContain("take_screenshot");
    expect(toolNames).toContain("extract_page_text");
  });

  it("should navigate to a URL", async () => {
    const tool = tools.find((t) => t.name === "navigate_to");
    expect(tool).toBeDefined();
    if (!tool) return;

    const result = await tool.handler({ url: "https://example.com" } as any);

    expect(mockBackend.navigate_to).toHaveBeenCalledWith("https://example.com");
    // @ts-ignore
    expect(result.content[0].text).toContain("Navigated to https://example.com");
  });

  it("should click an element", async () => {
    const tool = tools.find((t) => t.name === "click_element");
    expect(tool).toBeDefined();
    if (!tool) return;

    await tool.handler({ selector: "#btn" } as any);

    expect(mockBackend.click_element).toHaveBeenCalledWith("#btn");
  });

  it("should type text", async () => {
    const tool = tools.find((t) => t.name === "type_text");
    expect(tool).toBeDefined();
    if (!tool) return;

    await tool.handler({ selector: "#input", text: "hello" } as any);

    expect(mockBackend.type_text).toHaveBeenCalledWith("#input", "hello");
  });

  it("should take a screenshot", async () => {
    const tool = tools.find((t) => t.name === "take_screenshot");
    expect(tool).toBeDefined();
    if (!tool) return;

    const result = await tool.handler({} as any);

    expect(mockBackend.take_screenshot).toHaveBeenCalled();
    // @ts-ignore
    expect(result.content[0].data).toBe("fake-base64-image");
    // @ts-ignore
    expect(result.content[0].mimeType).toBe("image/png");
  });

  it("should extract text", async () => {
    const tool = tools.find((t) => t.name === "extract_page_text");
    expect(tool).toBeDefined();
    if (!tool) return;

    const result = await tool.handler({} as any);

    expect(mockBackend.extract_page_text).toHaveBeenCalled();
    // @ts-ignore
    expect(result.content[0].text).toBe("Page content");
  });
});
