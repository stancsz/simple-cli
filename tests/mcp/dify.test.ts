import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DifyServer } from "../../src/mcp_servers/dify/index.js";

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("DifyServer", () => {
  let server: DifyServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DIFY_API_KEY", "test-key");
    server = new DifyServer();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should fail if DIFY_API_KEY is missing", async () => {
    vi.unstubAllEnvs(); // Remove the key
    const result = await server.runChat("hello", "user-1");
    expect(result.content[0].text).toContain("Error: DIFY_API_KEY");
  });

  it("should call Dify API and return answer", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Hello from Dify",
        conversation_id: "conv-123",
      }),
    });

    const result = await server.runChat("hello", "user-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5001/v1/chat-messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
            "Authorization": "Bearer test-key"
        }),
        body: expect.stringContaining("hello")
      })
    );

    expect(result.content[0].text).toBe("Hello from Dify");
    expect(result.content[1].text).toContain("Conversation ID: conv-123");
  });

  it("should handle API errors", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const result = await server.runChat("hello", "user-1");
    expect(result.content[0].text).toContain("Dify API Error (401): Unauthorized");
  });
});
