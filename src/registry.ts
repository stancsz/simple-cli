/**
 * Tool Registry: Auto-imports tools from src/tools/
 * Supports both built-in tools and MCP tools
 */

import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { z } from 'zod';
import { getMCPManager, type MCPTool } from './mcp/manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, 'tools');

export type Permission = 'read' | 'write' | 'execute';

export interface Tool {
  name: string;
  description: string;
  permission: Permission;
  inputSchema: z.ZodType;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  source?: 'builtin' | 'mcp';
  serverName?: string;
}

// Alias for backward compatibility
export type { Tool as ToolModule };

// Load all tools from the tools directory
export const loadTools = async (): Promise<Map<string, Tool>> => {
  const tools = new Map<string, Tool>();

  try {
    const files = await readdir(TOOLS_DIR);

    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
      if (file.includes('.test.')) continue; // Skip test files

      try {
        const modulePath = join(TOOLS_DIR, file);
        const module = await import(pathToFileURL(modulePath).href);

        // Support both 'tool' export and direct exports
        const toolDef = module.tool || module;

        if (toolDef.name && toolDef.execute) {
          // Support both 'inputSchema' and 'schema'
          const schema = toolDef.inputSchema || toolDef.schema;

          tools.set(toolDef.name, {
            name: toolDef.name,
            description: toolDef.description || 'No description',
            permission: toolDef.permission || 'read',
            inputSchema: schema || z.object({}),
            execute: toolDef.execute,
            source: 'builtin',
          });
        }
      } catch (error) {
        // Silently skip files that can't be loaded
        if (process.env.DEBUG) {
          console.error(`Failed to load tool ${file}:`, error);
        }
      }
    }
  } catch (error) {
    // Tools directory may not exist yet
    if (process.env.DEBUG) {
      console.error('Failed to read tools directory:', error);
    }
  }

  return tools;
};

// Load MCP tools and merge with built-in tools
export const loadAllTools = async (): Promise<Map<string, Tool>> => {
  const tools = await loadTools();

  try {
    const mcpManager = getMCPManager();
    const mcpTools = mcpManager.getAllTools();

    for (const mcpTool of mcpTools) {
      // Prefix MCP tool names to avoid conflicts
      const toolName = `mcp_${mcpTool.serverName}_${mcpTool.name}`;

      tools.set(toolName, {
        name: toolName,
        description: mcpTool.description,
        permission: 'execute', // MCP tools are external
        inputSchema: z.object(mcpTool.inputSchema as z.ZodRawShape).passthrough(),
        execute: mcpTool.execute,
        source: 'mcp',
        serverName: mcpTool.serverName,
      });
    }
  } catch {
    // MCP not configured, skip
  }

  return tools;
};

// Get tool definitions for LLM prompt
export const getToolDefinitions = (tools: Map<string, Tool>): string => {
  const sections: string[] = [];

  // Group by source
  const builtinTools: Tool[] = [];
  const mcpTools: Tool[] = [];

  for (const tool of tools.values()) {
    if (tool.source === 'mcp') {
      mcpTools.push(tool);
    } else {
      builtinTools.push(tool);
    }
  }

  // Built-in tools
  if (builtinTools.length > 0) {
    sections.push('## Built-in Tools\n');
    for (const tool of builtinTools) {
      sections.push(formatToolDefinition(tool));
    }
  }

  // MCP tools
  if (mcpTools.length > 0) {
    sections.push('\n## MCP Tools\n');
    for (const tool of mcpTools) {
      sections.push(formatToolDefinition(tool));
    }
  }

  return sections.join('\n');
};

// Format a single tool definition
function formatToolDefinition(tool: Tool): string {
  const lines = [
    `### ${tool.name}`,
    tool.description,
    `Permission: ${tool.permission}`,
  ];

  if (tool.serverName) {
    lines.push(`Server: ${tool.serverName}`);
  }

  // Extract parameters from schema
  if (tool.inputSchema && 'shape' in tool.inputSchema) {
    const shape = (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
    const params = Object.entries(shape)
      .map(([key, value]) => {
        const zodType = value as z.ZodTypeAny;
        const description = zodType.description || '';
        const typeName = getTypeName(zodType);
        const optional = zodType.isOptional() ? '?' : '';
        return `  - ${key}${optional}: ${typeName}${description ? ` - ${description}` : ''}`;
      })
      .join('\n');

    if (params) {
      lines.push('Parameters:');
      lines.push(params);
    }
  }

  return lines.join('\n') + '\n';
}

// Get human-readable type name from Zod type
function getTypeName(zodType: z.ZodTypeAny): string {
  const def = zodType._def;

  if (def.typeName === 'ZodString') return 'string';
  if (def.typeName === 'ZodNumber') return 'number';
  if (def.typeName === 'ZodBoolean') return 'boolean';
  if (def.typeName === 'ZodArray') return 'array';
  if (def.typeName === 'ZodObject') return 'object';
  if (def.typeName === 'ZodEnum') return `enum(${def.values.join('|')})`;
  if (def.typeName === 'ZodOptional') return getTypeName(def.innerType);
  if (def.typeName === 'ZodDefault') return getTypeName(def.innerType);

  return def.typeName?.replace('Zod', '').toLowerCase() || 'unknown';
}

// Validate tool arguments
export const validateToolArgs = (tool: Tool, args: unknown): { valid: boolean; error?: string } => {
  try {
    tool.inputSchema.parse(args);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, error: messages.join('; ') };
    }
    return { valid: false, error: String(error) };
  }
};
