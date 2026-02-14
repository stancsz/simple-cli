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

  it("should handle midjourney_imagine tool", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ taskId: "task-123" }),
    });

    const result = await server.handleCallTool("midjourney_imagine", {
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

    const result = await server.handleCallTool("midjourney_upscale", {
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

    const result = await server.handleCallTool("midjourney_variation", {
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

    const result = await server.handleCallTool("midjourney_describe", {
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

    const result = await server.handleCallTool("midjourney_blend", {
      image_urls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      dimensions: "SQUARE",
    });

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

    const result = await server.handleCallTool("midjourney_face_swap", {
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

    const result = await server.handleCallTool("midjourney_status", {
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

    const result = await server.handleCallTool("midjourney_imagine", {
      prompt: "fail",
    });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("API Error: 500 Server Error - Internal Server Error");
  });

  it("should fail if API key is missing", async () => {
    delete process.env.MIDJOURNEY_API_KEY;
    server = new MidjourneyServer(); // Re-initialize to pick up env change if verified in constructor, but it's verified in callApi.

    const result = await server.handleCallTool("midjourney_imagine", {
      prompt: "fail",
    });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("MIDJOURNEY_API_KEY environment variable is not set");
  });
});
