import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareBrowserServer } from "../../src/mcp_servers/cloudflare_browser/index.js";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("CloudflareBrowserServer", () => {
  let server: CloudflareBrowserServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new CloudflareBrowserServer();
  });

  it("should fetch markdown successfully with token count", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "# Hello World",
      headers: {
        get: (key: string) => {
          if (key === "x-markdown-tokens") return "10";
          return null;
        },
      },
    });

    const result = await server.fetchMarkdown("https://example.com");
    expect(mockFetch).toHaveBeenCalledWith("https://example.com", {
      headers: { Accept: "text/markdown" },
    });
    expect(result.content[0].text).toContain("Token Count: 10");
    expect(result.content[0].text).toContain("# Hello World");
  });

  it("should fetch markdown successfully without token count", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "# Hello World",
      headers: {
        get: (key: string) => null,
      },
    });

    const result = await server.fetchMarkdown("https://example.com");
    expect(result.content[0].text).not.toContain("Token Count");
    expect(result.content[0].text).toContain("# Hello World");
  });

  it("should handle fetch errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(server.fetchMarkdown("https://example.com")).rejects.toThrow(
      "HTTP error! status: 404",
    );
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Network Error"));
    await expect(server.fetchMarkdown("https://example.com")).rejects.toThrow(
      "Failed to fetch markdown: Network Error",
    );
  });
});
