/**
 * Memory Tool - Persistent context and memory management
 * Based on GeminiCLI's memoryTool.ts
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { Tool } from '../registry.js';

// Input schema
export const inputSchema = z.object({
  operation: z.enum(['get', 'set', 'delete', 'list', 'search', 'clear']).describe('Memory operation'),
  key: z.string().optional().describe('Memory key'),
  value: z.string().optional().describe('Value to store'),
  query: z.string().optional().describe('Search query'),
  namespace: z.string().optional().default('default').describe('Memory namespace'),
});

type MemoryInput = z.infer<typeof inputSchema>;

interface MemoryEntry {
  key: string;
  value: string;
  timestamp: number;
  namespace: string;
  metadata?: Record<string, unknown>;
}

interface MemoryStore {
  version: number;
  entries: Record<string, MemoryEntry>;
}

// Get memory file path
function getMemoryPath(): string {
  const baseDir = process.env.SIMPLE_CLI_DATA_DIR ||
    join(process.env.HOME || '', '.config', 'simplecli');
  return join(baseDir, 'memory.json');
}

// Load memory store
async function loadMemory(): Promise<MemoryStore> {
  const path = getMemoryPath();

  if (!existsSync(path)) {
    return { version: 1, entries: {} };
  }

  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { version: 1, entries: {} };
  }
}

// Save memory store
async function saveMemory(store: MemoryStore): Promise<void> {
  const path = getMemoryPath();

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  await writeFile(path, JSON.stringify(store, null, 2));
}

// Generate unique key
function generateKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

// Execute memory operation
export async function execute(input: MemoryInput): Promise<{
  operation: string;
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const { operation, key, value, query, namespace } = inputSchema.parse(input);
  const store = await loadMemory();

  try {
    switch (operation) {
      case 'get': {
        if (!key) {
          return {
            operation,
            success: false,
            error: 'Key required for get operation',
          };
        }
        const fullKey = generateKey(namespace, key);
        const entry = store.entries[fullKey];

        if (!entry) {
          return {
            operation,
            success: true,
            data: null,
          };
        }

        return {
          operation,
          success: true,
          data: {
            key: entry.key,
            value: entry.value,
            timestamp: entry.timestamp,
          },
        };
      }

      case 'set': {
        if (!key || value === undefined) {
          return {
            operation,
            success: false,
            error: 'Key and value required for set operation',
          };
        }
        const fullKey = generateKey(namespace, key);

        store.entries[fullKey] = {
          key,
          value,
          timestamp: Date.now(),
          namespace,
        };

        await saveMemory(store);

        return {
          operation,
          success: true,
          data: { key, stored: true },
        };
      }

      case 'delete': {
        if (!key) {
          return {
            operation,
            success: false,
            error: 'Key required for delete operation',
          };
        }
        const fullKey = generateKey(namespace, key);
        const existed = fullKey in store.entries;
        delete store.entries[fullKey];

        await saveMemory(store);

        return {
          operation,
          success: true,
          data: { key, deleted: existed },
        };
      }

      case 'list': {
        const entries = Object.values(store.entries)
          .filter(e => e.namespace === namespace)
          .map(e => ({
            key: e.key,
            timestamp: e.timestamp,
            preview: e.value.slice(0, 100) + (e.value.length > 100 ? '...' : ''),
          }))
          .sort((a, b) => b.timestamp - a.timestamp);

        return {
          operation,
          success: true,
          data: {
            namespace,
            count: entries.length,
            entries,
          },
        };
      }

      case 'search': {
        if (!query) {
          return {
            operation,
            success: false,
            error: 'Query required for search operation',
          };
        }

        const queryLower = query.toLowerCase();
        const matches = Object.values(store.entries)
          .filter(e =>
            e.key.toLowerCase().includes(queryLower) ||
            e.value.toLowerCase().includes(queryLower)
          )
          .map(e => ({
            key: e.key,
            namespace: e.namespace,
            timestamp: e.timestamp,
            preview: e.value.slice(0, 100) + (e.value.length > 100 ? '...' : ''),
          }))
          .slice(0, 20);

        return {
          operation,
          success: true,
          data: {
            query,
            count: matches.length,
            matches,
          },
        };
      }

      case 'clear': {
        const beforeCount = Object.keys(store.entries).length;

        if (namespace === 'all') {
          store.entries = {};
        } else {
          for (const [k, entry] of Object.entries(store.entries)) {
            if (entry.namespace === namespace) {
              delete store.entries[k];
            }
          }
        }

        await saveMemory(store);

        const afterCount = Object.keys(store.entries).length;

        return {
          operation,
          success: true,
          data: {
            namespace,
            cleared: beforeCount - afterCount,
          },
        };
      }

      default:
        return {
          operation,
          success: false,
          error: `Unknown operation: ${operation}`,
        };
    }
  } catch (error) {
    return {
      operation,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Tool definition
export const tool: Tool = {
  name: 'memory',
  description: 'Store and retrieve persistent memory/context. Operations: get, set, delete, list, search, clear',
  inputSchema,
  permission: 'write',
  execute: async (args) => execute(args as MemoryInput),
};
