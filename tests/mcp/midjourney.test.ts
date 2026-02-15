import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MidjourneyServer } from "../../src/mcp_servers/midjourney/index.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MidjourneyServer", () => {
  let server: MidjourneyServer;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, MIDJOURNEY_API_KEY: "test-key" };
    server = new MidjourneyServer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to access tool handler
  const callTool = async (name: string, args: any) => {
    const mcpServer = (server as any).server;
    const tool = (mcpServer as any)._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  };

  it("should handle midjourney_imagine tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-123" }),
    });

    const result = await callTool("midjourney_imagine", {
      prompt: "A beautiful sunset",
      aspect_ratio: "16:9",
      process_mode: "fast",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/imagine",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          prompt: "A beautiful sunset",
          aspect_ratio: "16:9",
          process_mode: "fast",
          webhook_url: undefined, // Zod optional might be undefined or not present
        }),
      }
    );
    expect((result as any).content[0].text).toContain("task-123");
  });

  it("should handle midjourney_upscale tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-upscale-123" }),
    });

    const result = await callTool("midjourney_upscale", {
      task_id: "task-123",
      index: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/upscale",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          task_id: "task-123",
          index: 1,
        }),
      }
    );
    expect((result as any).content[0].text).toContain("task-upscale-123");
  });

  it("should handle midjourney_variation tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-variation-123" }),
    });

    const result = await callTool("midjourney_variation", {
      task_id: "task-123",
      index: 2,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/variation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          task_id: "task-123",
          index: 2,
        }),
      }
    );
    expect((result as any).content[0].text).toContain("task-variation-123");
  });

  it("should handle midjourney_describe tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-describe-123" }),
    });

    const result = await callTool("midjourney_describe", {
      image_url: "https://example.com/image.jpg",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/describe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          image_url: "https://example.com/image.jpg",
        }),
      }
    );
  });

  it("should handle midjourney_blend tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-blend-123" }),
    });

    const result = await callTool("midjourney_blend", {
      image_urls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      dimensions: "SQUARE",
    });

    // Zod schema for dimensions is optional string.
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/blend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          image_urls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
          dimensions: "SQUARE",
        }),
      }
    );
  });

  it("should handle midjourney_face_swap tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-swapped" }),
    });

    const result = await callTool("midjourney_face_swap", {
      source_url: "src",
      target_url: "tgt",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/face-swap",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          source_url: "src",
          target_url: "tgt",
        }),
      }
    );
  });

  it("should handle midjourney_status tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "completed", url: "http://result" }),
    });

    const result = await callTool("midjourney_status", {
      task_id: "task-123",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.userapi.ai/midjourney/v2/status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "test-key",
        },
        body: JSON.stringify({
          task_id: "task-123",
        }),
      }
    );
    expect((result as any).content[0].text).toContain("completed");
  });

  it("should handle API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "Internal Server Error",
    });

    // McpServer throws errors, it doesn't return { isError: true } structure directly from handler usually,
    // unless handler catches and returns it.
    // But `McpServer` catches throws and returns error response via transport.
    // Here we are calling handler directly. So it should throw.

    await expect(callTool("midjourney_imagine", {
      prompt: "fail",
    })).rejects.toThrow("API Error: 500 Server Error - Internal Server Error");
  });

  it("should fail if API key is missing", async () => {
    delete process.env.MIDJOURNEY_API_KEY;

    // We need to re-instantiate server because API key is checked/stored in constructor or method.
    // In my refactoring, it's checked in `callApi`.
    // However, constructor also checks process.env.
    // `callApi` checks `this.apiKey`.
    // `this.apiKey` is initialized in constructor.
    server = new MidjourneyServer();

    await expect(callTool("midjourney_imagine", {
      prompt: "fail",
    })).rejects.toThrow("MIDJOURNEY_API_KEY environment variable is not set");
  });
});
