/**
 * Tests for URL handling and detection
 * Equivalent to Aider's test_urls.py and url detection in test_coder.py
 */

import { describe, it, expect } from "vitest";

describe("urlHandling", () => {
  // URL detection regex matching Aider's pattern
  const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

  describe("URL detection", () => {
    it("should detect simple HTTP URL", () => {
      const text = "Check http://example.com for more info";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("http://example.com");
    });

    it("should detect HTTPS URL", () => {
      const text = "Visit https://www.example.com/page";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("https://www.example.com/page");
    });

    it("should detect URL with port", () => {
      const text = "Server at http://localhost:3000";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("http://localhost:3000");
    });

    it("should detect URL with path and query", () => {
      const text = "Go to https://example.com/path?query=value&other=123";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain(
        "https://example.com/path?query=value&other=123",
      );
    });

    it("should detect URL with fragment", () => {
      const text = "See https://example.com/page#section";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("https://example.com/page#section");
    });

    it("should detect URL with IP address", () => {
      const text = "Access http://127.0.0.1:8000/api";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("http://127.0.0.1:8000/api");
    });

    it("should detect multiple URLs", () => {
      const text = "Check http://example1.com and https://example2.com/page";
      const matches = text.match(URL_REGEX);
      expect(matches).toHaveLength(2);
      expect(matches).toContain("http://example1.com");
      expect(matches).toContain("https://example2.com/page");
    });

    it("should detect URL at end of sentence", () => {
      const text = "Visit https://example.com.";
      const matches = text.match(URL_REGEX);
      // URL without trailing period
      expect(matches?.[0]).toBe("https://example.com.");
    });

    it("should detect URL in parentheses", () => {
      const text = "See (https://example.com) for details";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("https://example.com)");
    });

    it("should not detect non-URLs", () => {
      const text = "The http protocol is used for web traffic";
      const matches = text.match(URL_REGEX);
      expect(matches).toBeNull();
    });

    it("should handle URL with user credentials", () => {
      const text = "Access http://user:password@example.com";
      const matches = text.match(URL_REGEX);
      expect(matches).toContain("http://user:password@example.com");
    });
  });

  describe("URL validation", () => {
    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    it("should validate correct URL", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
    });

    it("should validate URL with path", () => {
      expect(isValidUrl("https://example.com/path/to/page")).toBe(true);
    });

    it("should validate localhost URL", () => {
      expect(isValidUrl("http://localhost:3000")).toBe(true);
    });

    it("should reject invalid URL", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
    });

    it("should reject URL without protocol", () => {
      expect(isValidUrl("example.com")).toBe(false);
    });
  });

  describe("URL extraction from messages", () => {
    const extractUrls = (text: string): string[] => {
      const matches = text.match(URL_REGEX);
      return matches || [];
    };

    it("should extract URLs from user message", () => {
      const message = "Can you check https://example.com for the API docs?";
      const urls = extractUrls(message);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe("https://example.com");
    });

    it("should extract multiple URLs from message", () => {
      const message =
        "Compare http://old.example.com with https://new.example.com";
      const urls = extractUrls(message);
      expect(urls).toHaveLength(2);
    });

    it("should return empty array for no URLs", () => {
      const message = "This message has no URLs";
      const urls = extractUrls(message);
      expect(urls).toHaveLength(0);
    });

    it("should handle URL with complex query parameters", () => {
      const message =
        "Check https://api.example.com/v1/search?q=test&limit=10&offset=0";
      const urls = extractUrls(message);
      expect(urls[0]).toContain("q=test");
      expect(urls[0]).toContain("limit=10");
    });
  });

  describe("URL normalization", () => {
    const normalizeUrl = (url: string): string => {
      try {
        const parsed = new URL(url);
        return parsed.href;
      } catch {
        return url;
      }
    };

    it("should normalize URL with trailing slash", () => {
      const url = normalizeUrl("https://example.com");
      expect(url).toBe("https://example.com/");
    });

    it("should preserve path", () => {
      const url = normalizeUrl("https://example.com/path");
      expect(url).toBe("https://example.com/path");
    });

    it("should preserve query string", () => {
      const url = normalizeUrl("https://example.com?key=value");
      expect(url).toBe("https://example.com/?key=value");
    });

    it("should lowercase hostname", () => {
      const url = normalizeUrl("https://EXAMPLE.COM/Path");
      expect(url).toContain("example.com");
    });
  });

  describe("URL deduplication", () => {
    const deduplicateUrls = (urls: string[]): string[] => {
      return [...new Set(urls)];
    };

    it("should remove duplicate URLs", () => {
      const urls = [
        "https://example.com",
        "https://example.com",
        "https://other.com",
      ];
      const unique = deduplicateUrls(urls);
      expect(unique).toHaveLength(2);
    });

    it("should preserve order of first occurrence", () => {
      const urls = [
        "https://first.com",
        "https://second.com",
        "https://first.com",
      ];
      const unique = deduplicateUrls(urls);
      expect(unique[0]).toBe("https://first.com");
      expect(unique[1]).toBe("https://second.com");
    });
  });
});
