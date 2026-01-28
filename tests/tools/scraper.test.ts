/**
 * Tests for scraper tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { execute, tool } from '../../src/tools/scraper.js';

describe('scraper tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('scrapeUrl');
    });

    it('should have correct permission', () => {
      expect(tool.permission).toBe('read');
    });

    it('should have description', () => {
      expect(tool.description).toContain('URL');
    });
  });

  describe('execute', () => {
    it('should scrape HTML and convert to markdown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><body><h1>Title</h1><p>Content</p></body></html>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.url).toBe('https://example.com');
      expect(result.content).toContain('# Title');
      expect(result.content).toContain('Content');
      expect(result.error).toBeUndefined();
    });

    it('should return plain text as-is', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Plain text content',
      });

      const result = await execute({
        url: 'https://example.com/text',
        convertToMarkdown: false,
      });

      expect(result.content).toBe('Plain text content');
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await execute({ url: 'https://example.com/notfound' });

      expect(result.error).toContain('404');
      expect(result.content).toBe('');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await execute({ url: 'https://example.com' });

      expect(result.error).toContain('Network error');
    });

    it('should handle timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('abort'));

      const result = await execute({ url: 'https://example.com', timeout: 100 });

      expect(result.error).toContain('timed out');
    });
  });

  describe('HTML to Markdown conversion', () => {
    it('should convert headings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<h1>H1</h1><h2>H2</h2><h3>H3</h3>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).toContain('# H1');
      expect(result.content).toContain('## H2');
      expect(result.content).toContain('### H3');
    });

    it('should convert links', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<a href="https://link.com">Link Text</a>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).toContain('[Link Text](https://link.com)');
    });

    it('should convert bold and italic', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<strong>Bold</strong> and <em>Italic</em>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).toContain('**Bold**');
      expect(result.content).toContain('*Italic*');
    });

    it('should convert code blocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<code>inline</code> and <pre><code>block</code></pre>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).toContain('`inline`');
      expect(result.content).toContain('```');
    });

    it('should strip script and style tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<script>alert("xss")</script><style>.red{color:red}</style><p>Safe</p>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).not.toContain('alert');
      expect(result.content).not.toContain('color:red');
      expect(result.content).toContain('Safe');
    });

    it('should decode HTML entities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<p>&amp; &lt; &gt; &quot;</p>',
      });

      const result = await execute({ url: 'https://example.com' });

      expect(result.content).toContain('& < > "');
    });
  });

  describe('input validation', () => {
    it('should require valid URL', async () => {
      await expect(execute({ url: 'not-a-url' })).rejects.toThrow();
    });

    it('should accept optional parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'content',
      });

      const result = await execute({
        url: 'https://example.com',
        convertToMarkdown: false,
        verifySSL: true,
        timeout: 5000,
      });

      expect(result.content).toBe('content');
    });
  });
});
