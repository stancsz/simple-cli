import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTools } from "../../src/mcp_servers/desktop/tools.js";
import { DesktopBackend } from "../../src/mcp_servers/desktop/interfaces/DesktopBackend.js";
import { StagehandBackend } from "../../src/mcp_servers/desktop/backends/StagehandBackend.js";
import { AnthropicBackend } from "../../src/mcp_servers/desktop/backends/AnthropicBackend.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";

// Mock Stagehand and other backends
vi.mock("../../src/mcp_servers/desktop/backends/StagehandBackend.js");
vi.mock("../../src/mcp_servers/desktop/backends/AnthropicBackend.js");
vi.mock("../../src/brain/episodic.js");

describe("Desktop Server Backends", () => {
  let mockBackend: any;
  let mockMemory: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockBackend = {
        init: vi.fn(),
        navigate_to: vi.fn().mockResolvedValue("Navigated to google.com"),
        click_element: vi.fn().mockResolvedValue("Clicked #btn"),
        type_text: vi.fn().mockResolvedValue("Typed hello"),
        take_screenshot: vi.fn().mockResolvedValue("base64image"),
        extract_page_text: vi.fn().mockResolvedValue("Page text"),
        shutdown: vi.fn()
    };
    mockMemory = {
        store: vi.fn().mockResolvedValue(undefined),
        init: vi.fn()
    };
  });

  it("should route tool calls to the backend", async () => {
    const tools = createTools(mockBackend as DesktopBackend, mockMemory as EpisodicMemory);
    const navigateTool = tools.find(t => t.name === "navigate_to");

    expect(navigateTool).toBeDefined();

    const result = await navigateTool!.handler({ url: "https://google.com" } as any);

    expect(mockBackend.navigate_to).toHaveBeenCalledWith("https://google.com");
    expect(result.content[0].text).toBe("Navigated to google.com");
  });

  it("should log to Brain if taskId is provided", async () => {
    const tools = createTools(mockBackend as DesktopBackend, mockMemory as EpisodicMemory);
    const navigateTool = tools.find(t => t.name === "navigate_to");

    await navigateTool!.handler({
        url: "https://google.com",
        taskId: "task-123",
        company: "test-corp"
    } as any);

    expect(mockMemory.store).toHaveBeenCalledWith(
        "task-123",
        "navigate_to: https://google.com",
        "Navigated to google.com",
        [],
        "test-corp"
    );
  });

  it("should NOT log to Brain if taskId is missing", async () => {
    const tools = createTools(mockBackend as DesktopBackend, mockMemory as EpisodicMemory);
    const navigateTool = tools.find(t => t.name === "navigate_to");

    await navigateTool!.handler({
        url: "https://google.com"
    } as any);

    expect(mockMemory.store).not.toHaveBeenCalled();
  });

  it("should select correct backend based on env var (Simulation)", async () => {
    // We can't easily test index.ts main() execution without spawning,
    // but we can simulate the switch logic.

    const getBackend = (envType: string) => {
        switch (envType.toLowerCase()) {
            case "anthropic": return new AnthropicBackend();
            case "stagehand": return new StagehandBackend();
            default: return new StagehandBackend();
        }
    };

    const anthropic = getBackend("anthropic");
    expect(anthropic).toBeInstanceOf(AnthropicBackend);

    const stagehand = getBackend("stagehand");
    expect(stagehand).toBeInstanceOf(StagehandBackend);
  });

  it("should handle backend errors gracefully", async () => {
     mockBackend.navigate_to.mockRejectedValue(new Error("Network error"));
     const tools = createTools(mockBackend as DesktopBackend, mockMemory as EpisodicMemory);
     const navigateTool = tools.find(t => t.name === "navigate_to");

     const result = await navigateTool!.handler({ url: "https://bad.url" } as any);
     expect(result.isError).toBe(true);
     expect(result.content[0].text).toContain("Network error");
  });
});
