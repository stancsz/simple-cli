import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockMCP, resetMocks } from "./test_helpers/mock_mcp_server.js";

// Hoist mocks for @google/generative-ai
const { mockGoogleGenerativeAI, mockGetGenerativeModel, mockGenerateContent, mockSendMessage, mockGenerateContentStream } = vi.hoisted(() => {
    const mockGenerateContent = vi.fn();
    const mockSendMessage = vi.fn();
    const mockGenerateContentStream = vi.fn();

    const mockModel = {
        generateContent: mockGenerateContent,
        startChat: vi.fn(() => ({ sendMessage: mockSendMessage })),
        generateContentStream: mockGenerateContentStream
    };

    const mockGetGenerativeModel = vi.fn(() => mockModel);
    const mockGoogleGenerativeAI = vi.fn(() => ({
        getGenerativeModel: mockGetGenerativeModel
    }));

    return {
        mockGoogleGenerativeAI,
        mockGetGenerativeModel,
        mockGenerateContent,
        mockSendMessage,
        mockGenerateContentStream
    };
});

vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: mockGoogleGenerativeAI,
    HarmCategory: {},
    HarmBlockThreshold: {}
  };
});

// Mock MCP Infrastructure
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", async () => {
    const { MockMcpServer } = await import("./test_helpers/mock_mcp_server.js");
    return {
        McpServer: MockMcpServer
    };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class { connect() {} }
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
    StreamableHTTPServerTransport: class { connect() {} }
}));

import { GeminiServer } from "../../src/mcp_servers/gemini/index.js";

describe("Gemini MCP Server", () => {
  let server: GeminiServer;
  let mcp: MockMCP;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
    process.env.GOOGLE_API_KEY = "test-key";

    // Create server (registers tools to global mock)
    server = new GeminiServer();
    mcp = new MockMCP();
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
  });

  it("should initialize with API key", () => {
    expect(server).toBeDefined();
    expect(mockGoogleGenerativeAI).toHaveBeenCalledWith("test-key");
  });

  it("gemini_generate_content should call API and return text", async () => {
    const client = mcp.getClient("gemini");

    // Mock response structure for generateContent
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => "Generated content"
      }
    });

    const result = await client.callTool({
      name: "gemini_generate_content",
      arguments: {
        prompt: "Hello",
        model_name: "gemini-1.5-flash"
      }
    });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-1.5-flash" }));
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [{ role: 'user', parts: [{ text: "Hello" }] }]
    }));
    expect(result.content[0].text).toBe("Generated content");
  });

  it("gemini_chat should call API and return text", async () => {
    const client = mcp.getClient("gemini");

    // Mock response structure for sendMessage
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => "Chat response"
      }
    });

    const result = await client.callTool({
      name: "gemini_chat",
      arguments: {
        message: "Hi there",
        history: []
      }
    });

    expect(mockGetGenerativeModel).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith("Hi there");
    expect(result.content[0].text).toBe("Chat response");
  });

  it("gemini_stream_content should aggregate stream chunks", async () => {
    const client = mcp.getClient("gemini");

    // Mock stream response
    // Needs to be an async iterable under .stream property
    const mockStream = {
      stream: (async function* () {
        yield { text: () => "Chunk 1" };
        yield { text: () => "Chunk 2" };
      })()
    };

    mockGenerateContentStream.mockResolvedValue(mockStream);

    const result = await client.callTool({
      name: "gemini_stream_content",
      arguments: {
        prompt: "Stream me",
        model_name: "gemini-1.5-pro"
      }
    });

    expect(mockGenerateContentStream).toHaveBeenCalledWith("Stream me");
    expect(result.content[0].text).toBe("Chunk 1Chunk 2");
  });

  it("should handle API errors gracefully", async () => {
    const client = mcp.getClient("gemini");

    mockGenerateContent.mockRejectedValue(new Error("API Failure"));

    const result = await client.callTool({
      name: "gemini_generate_content",
      arguments: { prompt: "Fail" }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Gemini API Error: API Failure");
  });

  it("should fail gracefully if API key is missing", async () => {
      // Clear env
      delete process.env.GOOGLE_API_KEY;

      // Reset mocks to clear tool registration
      resetMocks();

      // Re-instantiate server without API key in env
      // Note: Constructor reads env.
      const serverNoKey = new GeminiServer();

      const client = mcp.getClient("gemini");
      const result = await client.callTool({
          name: "gemini_generate_content",
          arguments: { prompt: "No key" }
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("GOOGLE_API_KEY is not set");
  });
});
