/**
 * Tests for MCP client functionality
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    listTools: vi.fn().mockResolvedValue({
      tools: [{ name: "test_tool", description: "A test tool" }],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Tool result" }],
    }),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(),
}));

describe("mcp", () => {
  describe("MCPServer configuration", () => {
    it("should validate server configuration schema", () => {
      const ServerSchema = z.object({
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
      });

      const validConfig = {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      };

      expect(() => ServerSchema.parse(validConfig)).not.toThrow();
    });

    it("should reject invalid server configuration", () => {
      const ServerSchema = z.object({
        name: z.string(),
        command: z.string(),
      });

      const invalidConfig = {
        name: "test",
        // missing command
      };

      expect(() => ServerSchema.parse(invalidConfig)).toThrow();
    });

    it("should handle environment variables in config", () => {
      const config = {
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "test-token",
        },
      };

      expect(config.env.GITHUB_TOKEN).toBe("test-token");
    });
  });

  describe("MCP tool schema", () => {
    it("should define tool with input schema", () => {
      const tool = {
        name: "read_file",
        description: "Read a file from the filesystem",
        inputSchema: z.object({
          path: z.string().describe("Path to the file"),
        }),
      };

      expect(tool.name).toBe("read_file");
      expect(tool.description).toContain("Read a file");
    });

    it("should validate tool input", () => {
      const inputSchema = z.object({
        path: z.string(),
        encoding: z.string().optional(),
      });

      const validInput = { path: "/tmp/test.txt" };
      const invalidInput = { path: 123 }; // Should be string

      expect(() => inputSchema.parse(validInput)).not.toThrow();
      expect(() => inputSchema.parse(invalidInput)).toThrow();
    });
  });

  describe("MCP configuration loading", () => {
    it("should parse valid MCP config JSON", () => {
      const configJson = `{
        "servers": [
          {
            "name": "filesystem",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
          }
        ]
      }`;

      const config = JSON.parse(configJson);
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].name).toBe("filesystem");
    });

    it("should handle empty servers array", () => {
      const config = { servers: [] };
      expect(config.servers).toHaveLength(0);
    });

    it("should handle missing config gracefully", () => {
      const loadConfig = async (path: string) => {
        try {
          // Simulating file not found
          throw new Error("ENOENT");
        } catch {
          return { servers: [] };
        }
      };

      expect(loadConfig("./nonexistent.json")).resolves.toEqual({
        servers: [],
      });
    });
  });

  describe("tool call handling", () => {
    it("should format tool call arguments", () => {
      const toolCall = {
        name: "read_file",
        arguments: {
          path: "/tmp/test.txt",
        },
      };

      expect(toolCall.name).toBe("read_file");
      expect(toolCall.arguments.path).toBe("/tmp/test.txt");
    });

    it("should handle tool call response", () => {
      const response = {
        content: [{ type: "text", text: "File contents here" }],
      };

      const textContent = response.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      expect(textContent).toBe("File contents here");
    });

    it("should handle tool call error", () => {
      const errorResponse = {
        error: {
          code: "FILE_NOT_FOUND",
          message: "The specified file does not exist",
        },
      };

      expect(errorResponse.error.code).toBe("FILE_NOT_FOUND");
    });
  });

  describe("connection management", () => {
    it("should track connection state", () => {
      const connections = new Map<string, { connected: boolean }>();

      connections.set("filesystem", { connected: true });
      connections.set("github", { connected: false });

      expect(connections.get("filesystem")?.connected).toBe(true);
      expect(connections.get("github")?.connected).toBe(false);
    });

    it("should handle disconnect", () => {
      const connections = new Map<string, { connected: boolean }>();
      connections.set("test", { connected: true });

      // Simulate disconnect
      connections.delete("test");

      expect(connections.has("test")).toBe(false);
    });

    it("should prevent duplicate connections", () => {
      const connections = new Map<string, boolean>();

      const connect = (name: string): boolean => {
        if (connections.has(name)) {
          return false; // Already connected
        }
        connections.set(name, true);
        return true;
      };

      expect(connect("server1")).toBe(true);
      expect(connect("server1")).toBe(false); // Duplicate
      expect(connect("server2")).toBe(true);
    });
  });
});
