import { describe, it, expect, vi, beforeEach } from "vitest";
import { tools } from "../../src/mcp_servers/desktop/tools.js";

// Mock Stagehand
const mockPage = {
  goto: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
  evaluate: vi.fn().mockResolvedValue("Page content"),
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

describe("Desktop Orchestration Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockStagehandInstance.init).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", { waitUntil: "domcontentloaded" });
    // @ts-ignore
    expect(result.content[0].text).toContain("Navigated to https://example.com");
  });

  it("should click an element", async () => {
    const tool = tools.find((t) => t.name === "click_element");
    expect(tool).toBeDefined();
    if (!tool) return;

    await tool.handler({ selector: "#btn" } as any);

    expect(mockPage.click).toHaveBeenCalledWith("#btn");
  });

  it("should type text", async () => {
    const tool = tools.find((t) => t.name === "type_text");
    expect(tool).toBeDefined();
    if (!tool) return;

    await tool.handler({ selector: "#input", text: "hello" } as any);

    expect(mockPage.fill).toHaveBeenCalledWith("#input", "hello");
  });

  it("should take a screenshot", async () => {
    const tool = tools.find((t) => t.name === "take_screenshot");
    expect(tool).toBeDefined();
    if (!tool) return;

    const result = await tool.handler({} as any);

    expect(mockPage.screenshot).toHaveBeenCalled();
    // @ts-ignore
    expect(result.content[0].data).toBe(Buffer.from("fake-image").toString("base64"));
    // @ts-ignore
    expect(result.content[0].mimeType).toBe("image/png");
  });

  it("should extract text", async () => {
    const tool = tools.find((t) => t.name === "extract_page_text");
    expect(tool).toBeDefined();
    if (!tool) return;

    const result = await tool.handler({} as any);

    expect(mockPage.evaluate).toHaveBeenCalled();
    // @ts-ignore
    expect(result.content[0].text).toBe("Page content");
  });
});
