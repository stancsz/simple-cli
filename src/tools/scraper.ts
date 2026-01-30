/**
 * Web Scraper Tool - Fetches and converts web content to markdown
 * Uses turndown for robust HTML to Markdown conversion (with regex fallback)
 */

import { z } from 'zod';
import type { Tool } from '../registry.js';

// Input schema
export const inputSchema = z.object({
  url: z.string().url().describe('URL to scrape'),
  convertToMarkdown: z.boolean().optional().default(true).describe('Convert HTML to Markdown'),
  verifySSL: z.boolean().optional().default(true).describe('Verify SSL certificates'),
  timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

type ScraperInput = z.infer<typeof inputSchema>;

// Cached turndown instance
let turndownInstance: any = null;
let turndownLoaded = false;

// Get or create turndown instance (lazy load)
async function getTurndown(): Promise<any> {
  if (!turndownLoaded) {
    turndownLoaded = true;
    try {
      const mod = await import('turndown') as any;
      const TurndownService = mod.default;
      turndownInstance = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
      });

      // Remove script and style elements
      turndownInstance.remove(['script', 'style', 'noscript', 'iframe', 'svg']);

      // Custom rule for code blocks with language hints
      turndownInstance.addRule('codeBlock', {
        filter: (node: Element) => {
          return (
            node.nodeName === 'PRE' &&
            node.firstChild !== null &&
            node.firstChild.nodeName === 'CODE'
          );
        },
        replacement: (_content: string, node: Element) => {
          const codeNode = node.firstChild as Element;
          const className = codeNode.getAttribute?.('class') || '';
          const langMatch = className.match(/language-(\w+)/);
          const lang = langMatch ? langMatch[1] : '';
          const code = codeNode.textContent || '';
          return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
        },
      });
    } catch {
      // turndown not installed, will use fallback
    }
  }
  return turndownInstance;
}

// Fallback regex-based HTML to Markdown conversion
function htmlToMarkdownFallback(html: string): string {
  let md = html;

  // Remove script and style tags
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Convert headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

  // Convert paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '\n$1\n');

  // Convert links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Convert bold
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');

  // Convert italic
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Convert inline code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Convert code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '\n```\n$1\n```\n');

  // Convert lists
  md = md.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_, content) => {
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  });
  md = md.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_, content) => {
    let i = 1;
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${i++}. $1\n`);
  });

  // Convert blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, content) => {
    return content.split('\n').map((line: string) => `> ${line}`).join('\n');
  });

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Convert horizontal rules
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

// Slim down HTML by removing unnecessary elements before conversion
function slimDownHtml(html: string): string {
  let slim = html;

  // Remove SVG elements
  slim = slim.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Remove data: URLs (large embedded content)
  slim = slim.replace(/\s*(?:href|src)=["']data:[^"']*["']/gi, '');

  // Remove inline styles
  slim = slim.replace(/\s*style=["'][^"']*["']/gi, '');

  // Remove tracking pixels and tiny images
  slim = slim.replace(/<img[^>]*(?:width|height)=["']?[01](?:px)?["']?[^>]*>/gi, '');

  return slim;
}

// Check if content looks like HTML
function looksLikeHtml(content: string): boolean {
  const htmlPatterns = [
    /<!DOCTYPE\s+html/i,
    /<html/i,
    /<head/i,
    /<body/i,
    /<div/i,
    /<p>/i,
    /<a\s+href=/i,
  ];
  return htmlPatterns.some(pattern => pattern.test(content));
}

// Convert HTML to Markdown using turndown or fallback
async function htmlToMarkdown(html: string): Promise<string> {
  const turndown = await getTurndown();

  if (turndown) {
    try {
      return turndown.turndown(html);
    } catch {
      // Fall through to regex fallback
    }
  }

  return htmlToMarkdownFallback(html);
}

// Execute scraping
export async function execute(input: ScraperInput): Promise<{
  url: string;
  content: string;
  contentType: string;
  error?: string;
}> {
  const { url, convertToMarkdown, verifySSL, timeout } = inputSchema.parse(input);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'simplecli/0.2.1 (+https://github.com/stancsz/simple-cli)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        content: '',
        contentType: '',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let content = await response.text();

    // Convert HTML to Markdown if requested
    if (convertToMarkdown && (contentType.includes('text/html') || looksLikeHtml(content))) {
      content = slimDownHtml(content);
      content = await htmlToMarkdown(content);

      // Clean up excessive whitespace
      content = content.replace(/\n{3,}/g, '\n\n').trim();
    }

    return {
      url,
      content,
      contentType,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      url,
      content: '',
      contentType: '',
      error: errorMessage.includes('abort') ? 'Request timed out' : errorMessage,
    };
  }
}

// Tool definition
export const tool: Tool = {
  name: 'scrapeUrl',
  description: 'Fetch a URL and convert its content to markdown. Useful for reading web pages, documentation, or API responses.',
  inputSchema,
  permission: 'read',
  execute: async (args) => execute(args as ScraperInput),
};
