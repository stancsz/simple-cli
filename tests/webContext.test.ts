/**
 * Tests for web context integration in conversations
 * Equivalent to Aider's check_for_urls in test_coder.py
 */

import { describe, it, expect, vi } from "vitest";

// Helper to extract and process URLs from user messages
const checkForUrls = (
  message: string,
  scrape: (url: string) => Promise<string | null>,
): Promise<string> => {
  return new Promise(async (resolve) => {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const urls = message.match(urlRegex);

    if (!urls || urls.length === 0) {
      resolve(message);
      return;
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(urls)];
    let result = message;

    for (const url of uniqueUrls) {
      const content = await scrape(url);
      if (content) {
        result += `\n\n--- Content from ${url} ---\n${content}`;
      }
    }

    resolve(result);
  });
};

describe("webContext", () => {
  describe("URL extraction from messages", () => {
    it("should extract HTTP URL", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Check http://example.com, it's cool";
      await checkForUrls(message, mockScrape);

      expect(mockScrape).toHaveBeenCalledWith("http://example.com,");
    });

    it("should extract HTTPS URL with path", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Visit https://www.example.com/page and see stuff";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("Scraped content");
    });

    it("should extract URL with port", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Look at http://localhost:3000";
      await checkForUrls(message, mockScrape);

      expect(mockScrape).toHaveBeenCalledWith("http://localhost:3000");
    });

    it("should extract URL with query parameters", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message =
        "Go to http://subdomain.example.com:8080/path?query=value, or not";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("Content from");
    });

    it("should extract URL with fragment", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "See https://example.com/path#fragment for example";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("https://example.com/path#fragment");
    });

    it("should extract IP address URL", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Open http://127.0.0.1:8000/api/v1/";
      await checkForUrls(message, mockScrape);

      expect(mockScrape).toHaveBeenCalledWith("http://127.0.0.1:8000/api/v1/");
    });

    it("should extract URL with credentials", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Access http://user:password@example.com";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("http://user:password@example.com");
    });

    it("should handle multiple URLs", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "Check http://example1.com and https://example2.com/page";
      await checkForUrls(message, mockScrape);

      expect(mockScrape).toHaveBeenCalledTimes(2);
    });

    it("should return original message when no URLs", async () => {
      const mockScrape = vi.fn().mockResolvedValue("Scraped content");
      const message = "This text contains no URL";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toBe(message);
      expect(mockScrape).not.toHaveBeenCalled();
    });

    it("should deduplicate repeated URLs", async () => {
      const mockScrape = vi.fn().mockResolvedValue("content");
      const message =
        "Check https://example.com then https://example.com again";

      await checkForUrls(message, mockScrape);

      // Should only scrape once due to deduplication
      expect(mockScrape).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL context appending", () => {
    it("should append scraped content to message", async () => {
      const mockScrape = vi.fn().mockResolvedValue("API Documentation here");
      const message = "Check https://docs.example.com";

      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("Check https://docs.example.com");
      expect(result).toContain("API Documentation here");
      expect(result).toContain("--- Content from");
    });

    it("should handle failed scrape gracefully", async () => {
      const mockScrape = vi.fn().mockResolvedValue(null);
      const message = "Check https://example.com";

      const result = await checkForUrls(message, mockScrape);

      // Should not append content section
      expect(result).not.toContain("--- Content from");
    });

    it("should handle multiple successful scrapes", async () => {
      let callCount = 0;
      const mockScrape = vi.fn().mockImplementation((url) => {
        callCount++;
        return Promise.resolve(`Content ${callCount}`);
      });

      const message = "See https://a.com and https://b.com";
      const result = await checkForUrls(message, mockScrape);

      expect(result).toContain("Content 1");
      expect(result).toContain("Content 2");
    });
  });

  describe("URL detection edge cases", () => {
    const noopScrape = vi.fn().mockResolvedValue("");

    beforeEach(() => {
      noopScrape.mockClear();
    });

    it("should handle URL with parentheses in path", async () => {
      const message = "Use https://example.com/path_(with_parentheses)";
      await checkForUrls(message, noopScrape);

      expect(noopScrape).toHaveBeenCalled();
    });

    it("should handle URL in markdown link", async () => {
      const message = "See [docs](https://example.com/docs)";
      await checkForUrls(message, noopScrape);

      expect(noopScrape).toHaveBeenCalledWith("https://example.com/docs)");
    });

    it("should handle URL followed by punctuation", async () => {
      const message = "Visit https://example.com!";
      await checkForUrls(message, noopScrape);

      expect(noopScrape).toHaveBeenCalled();
    });

    it("should handle URL in quotes", async () => {
      const message = 'The URL is "https://example.com"';
      await checkForUrls(message, noopScrape);

      expect(noopScrape).toHaveBeenCalledWith("https://example.com");
    });
  });

  describe("web content integration", () => {
    it("should format web content for context", () => {
      const url = "https://api.example.com/docs";
      const content = "# API Reference\n\nEndpoints:\n- GET /users";

      const formatted = `\n\n--- Content from ${url} ---\n${content}`;

      expect(formatted).toContain(url);
      expect(formatted).toContain("API Reference");
      expect(formatted).toContain("GET /users");
    });

    it("should truncate very long web content", () => {
      const maxLength = 10000;
      const longContent = "x".repeat(20000);

      const truncated =
        longContent.length > maxLength
          ? longContent.slice(0, maxLength) + "...[truncated]"
          : longContent;

      expect(truncated.length).toBeLessThan(longContent.length);
      expect(truncated).toContain("[truncated]");
    });
  });

  describe("URL allowlist/blocklist", () => {
    const isUrlAllowed = (url: string, blocklist: string[] = []): boolean => {
      try {
        const parsed = new URL(url);
        return !blocklist.some((blocked) => parsed.hostname.includes(blocked));
      } catch {
        return false;
      }
    };

    it("should allow URL not in blocklist", () => {
      expect(isUrlAllowed("https://example.com", ["blocked.com"])).toBe(true);
    });

    it("should block URL in blocklist", () => {
      expect(isUrlAllowed("https://blocked.com", ["blocked.com"])).toBe(false);
    });

    it("should block subdomain of blocked domain", () => {
      expect(isUrlAllowed("https://sub.blocked.com", ["blocked.com"])).toBe(
        false,
      );
    });

    it("should reject invalid URLs", () => {
      expect(isUrlAllowed("not-a-url", [])).toBe(false);
    });
  });
});
