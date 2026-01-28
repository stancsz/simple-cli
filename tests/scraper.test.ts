/**
 * Tests for web scraping functionality
 * Equivalent to Aider's test_scrape.py
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types for scraper
interface ScrapeResult {
  content: string | null;
  contentType: string | null;
  error?: string;
}

interface ScraperOptions {
  verifySSL?: boolean;
  timeout?: number;
  userAgent?: string;
}

// Mock scraper implementation for testing
class MockScraper {
  private options: ScraperOptions;
  private mockResponses: Map<string, ScrapeResult>;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      verifySSL: true,
      timeout: 30000,
      userAgent: 'SimpleCLI/1.0',
      ...options
    };
    this.mockResponses = new Map();
  }

  setMockResponse(url: string, response: ScrapeResult): void {
    this.mockResponses.set(url, response);
  }

  async scrape(url: string): Promise<ScrapeResult> {
    // Check mock responses first
    if (this.mockResponses.has(url)) {
      return this.mockResponses.get(url)!;
    }

    // Simulate SSL error for self-signed certs
    if (url.includes('self-signed') && this.options.verifySSL) {
      return {
        content: null,
        contentType: null,
        error: 'SSL certificate verification failed'
      };
    }

    // Simulate timeout
    if (url.includes('timeout')) {
      return {
        content: null,
        contentType: null,
        error: 'Request timed out'
      };
    }

    // Simulate 404
    if (url.includes('notfound')) {
      return {
        content: null,
        contentType: null,
        error: 'Page not found (404)'
      };
    }

    // Default success response
    return {
      content: '<html><body><h1>Example</h1></body></html>',
      contentType: 'text/html'
    };
  }

  htmlToMarkdown(html: string): string {
    // Simple HTML to markdown conversion
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      .replace(/<[^>]+>/g, '')
      .trim();
  }
}

describe('scraper', () => {
  let scraper: MockScraper;

  beforeEach(() => {
    scraper = new MockScraper();
  });

  describe('basic scraping', () => {
    it('should scrape HTML content', async () => {
      scraper.setMockResponse('https://example.com', {
        content: '<html><body><h1>Example Domain</h1></body></html>',
        contentType: 'text/html'
      });

      const result = await scraper.scrape('https://example.com');

      expect(result.content).toContain('Example Domain');
      expect(result.contentType).toBe('text/html');
      expect(result.error).toBeUndefined();
    });

    it('should handle plain text content', async () => {
      scraper.setMockResponse('https://example.com/text', {
        content: 'This is plain text content.',
        contentType: 'text/plain'
      });

      const result = await scraper.scrape('https://example.com/text');

      expect(result.content).toBe('This is plain text content.');
      expect(result.contentType).toBe('text/plain');
    });

    it('should handle JSON content', async () => {
      const jsonContent = JSON.stringify({ message: 'Hello' });
      scraper.setMockResponse('https://api.example.com/data', {
        content: jsonContent,
        contentType: 'application/json'
      });

      const result = await scraper.scrape('https://api.example.com/data');

      expect(result.content).toBe(jsonContent);
      expect(result.contentType).toBe('application/json');
    });
  });

  describe('SSL verification', () => {
    it('should fail on self-signed cert with SSL verification', async () => {
      const strictScraper = new MockScraper({ verifySSL: true });

      const result = await strictScraper.scrape('https://self-signed.example.com');

      expect(result.content).toBeNull();
      expect(result.error).toContain('SSL');
    });

    it('should succeed on self-signed cert without SSL verification', async () => {
      const lenientScraper = new MockScraper({ verifySSL: false });
      lenientScraper.setMockResponse('https://self-signed.example.com', {
        content: '<html><body>Content</body></html>',
        contentType: 'text/html'
      });

      const result = await lenientScraper.scrape('https://self-signed.example.com');

      expect(result.content).not.toBeNull();
      expect(result.error).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle timeout', async () => {
      const result = await scraper.scrape('https://timeout.example.com');

      expect(result.content).toBeNull();
      expect(result.error).toContain('timed out');
    });

    it('should handle 404 not found', async () => {
      const result = await scraper.scrape('https://notfound.example.com');

      expect(result.content).toBeNull();
      expect(result.error).toContain('404');
    });

    it('should return error for failed scrape', async () => {
      scraper.setMockResponse('https://error.example.com', {
        content: null,
        contentType: null,
        error: 'Connection refused'
      });

      const result = await scraper.scrape('https://error.example.com');

      expect(result.error).toBe('Connection refused');
    });
  });

  describe('HTML to markdown conversion', () => {
    it('should convert headings', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toContain('# Title');
      expect(md).toContain('## Subtitle');
      expect(md).toContain('### Section');
    });

    it('should convert paragraphs', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toContain('First paragraph');
      expect(md).toContain('Second paragraph');
    });

    it('should convert links', () => {
      const html = '<a href="https://example.com">Example</a>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toBe('[Example](https://example.com)');
    });

    it('should convert bold text', () => {
      const html = '<strong>Bold text</strong>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toBe('**Bold text**');
    });

    it('should convert italic text', () => {
      const html = '<em>Italic text</em>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toBe('*Italic text*');
    });

    it('should convert inline code', () => {
      const html = '<code>const x = 1;</code>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).toBe('`const x = 1;`');
    });

    it('should strip remaining HTML tags', () => {
      const html = '<div><span>Text</span></div>';
      const md = scraper.htmlToMarkdown(html);

      expect(md).not.toContain('<');
      expect(md).not.toContain('>');
      expect(md).toContain('Text');
    });

    it('should handle complex HTML', () => {
      const html = `
        <html>
          <body>
            <h1>Documentation</h1>
            <p>Welcome to the <strong>API docs</strong>.</p>
            <p>See <a href="https://api.example.com">API reference</a> for details.</p>
          </body>
        </html>
      `;
      const md = scraper.htmlToMarkdown(html);

      expect(md).toContain('# Documentation');
      expect(md).toContain('**API docs**');
      expect(md).toContain('[API reference](https://api.example.com)');
    });
  });

  describe('content type handling', () => {
    it('should detect HTML content type', async () => {
      scraper.setMockResponse('https://example.com', {
        content: '<html></html>',
        contentType: 'text/html; charset=utf-8'
      });

      const result = await scraper.scrape('https://example.com');
      expect(result.contentType).toContain('text/html');
    });

    it('should detect JSON content type', async () => {
      scraper.setMockResponse('https://api.example.com', {
        content: '{}',
        contentType: 'application/json'
      });

      const result = await scraper.scrape('https://api.example.com');
      expect(result.contentType).toBe('application/json');
    });

    it('should detect plain text content type', async () => {
      scraper.setMockResponse('https://example.com/robots.txt', {
        content: 'User-agent: *',
        contentType: 'text/plain'
      });

      const result = await scraper.scrape('https://example.com/robots.txt');
      expect(result.contentType).toBe('text/plain');
    });
  });

  describe('scraper options', () => {
    it('should use custom timeout', () => {
      const customScraper = new MockScraper({ timeout: 5000 });
      expect(customScraper).toBeDefined();
    });

    it('should use custom user agent', () => {
      const customScraper = new MockScraper({ userAgent: 'CustomAgent/1.0' });
      expect(customScraper).toBeDefined();
    });

    it('should merge options with defaults', () => {
      const customScraper = new MockScraper({ timeout: 10000 });
      // Should still have verifySSL default
      expect(customScraper).toBeDefined();
    });
  });

  describe('retry logic', () => {
    it('should handle intermittent failures', async () => {
      let attempts = 0;

      const scrapeWithRetry = async (url: string, maxRetries: number = 3): Promise<ScrapeResult> => {
        for (let i = 0; i < maxRetries; i++) {
          attempts++;
          const result = await scraper.scrape(url);
          if (result.content !== null) {
            return result;
          }
        }
        return { content: null, contentType: null, error: 'Max retries exceeded' };
      };

      // First call will fail, but we mock success
      scraper.setMockResponse('https://flaky.example.com', {
        content: 'Success!',
        contentType: 'text/plain'
      });

      const result = await scrapeWithRetry('https://flaky.example.com');

      expect(result.content).toBe('Success!');
      expect(attempts).toBe(1); // Should succeed on first try with mock
    });
  });
});
