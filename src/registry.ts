/**
 * Tool Registry: Auto-imports tools from src/tools/, skills/, and scripts/
 * Supports built-in tools, MCP tools, and project-specific custom tools
 */

import { readdir, readFile, stat } from 'fs/promises';
import { spawn } from 'child_process';
import { join, dirname, basename, extname } from 'path';
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
  source?: 'builtin' | 'mcp' | 'project';
  serverName?: string;
  specification?: string; // Original doc/markdown content
}

// Alias for backward compatibility
export type { Tool as ToolModule };

/**
 * Extract documentation from the beginning of a file (comments)
 */
function extractDocFromComments(content: string): string {
  const lines = content.split('\n');
  let doc = '';
  let inDoc = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/**') || trimmed.startsWith('"""')) {
      inDoc = true;
      continue;
    }
    if (inDoc && (trimmed.endsWith('*/') || trimmed.endsWith('"""'))) {
      inDoc = false;
      break;
    }
    if (inDoc) {
      doc += trimmed.replace(/^\* ?/, '') + '\n';
    } else if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      doc += trimmed.replace(/^(\/\/|#) ?/, '') + '\n';
    } else if (trimmed && !trimmed.startsWith('import') && !trimmed.startsWith('from')) {
      break;
    }
  }
  return doc.trim();
}

/**
 * Parses a tool definition from a Markdown file (.md) or string
 */
function parseMarkdownTool(content: string, filename: string): any {
  const lines = content.split('\n');
  const meta: any = {
    name: basename(filename, extname(filename)),
    description: '',
    command: '',
    parameters: {},
    permission: 'execute'
  };

  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      meta.name = line.replace('# ', '').trim();
    } else if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim().toLowerCase();
    } else if (currentSection === 'command' && line.trim()) {
      meta.command = line.trim();
    } else if (currentSection === 'parameters' && line.trim().startsWith('- ')) {
      const match = line.match(/- (\w+): (\w+)(?: - (.+))?/);
      if (match) {
        meta.parameters[match[1]] = { type: match[2], description: match[3] || '' };
      }
    } else if (!currentSection && line.trim() && !line.startsWith('#')) {
      meta.description += line.trim() + ' ';
    }
  }

  meta.description = meta.description.trim();
  return meta;
}

// Helper to create a Tool from metadata (JSON or MD)
function createScriptTool(meta: any, source: 'project' | 'builtin', spec?: string): Tool {
  return {
    name: meta.name,
    description: meta.description || `Script tool: ${meta.command}`,
    permission: meta.permission || 'execute',
    inputSchema: z.object({}).passthrough(), // Flexible schema for scripts
    source,
    specification: spec,
    execute: async (args: Record<string, unknown>) => {
      return new Promise((resolve, reject) => {
        let finalCommand = meta.command;
        const isWindows = process.platform === 'win32';

        if (isWindows && finalCommand.endsWith('.ps1')) {
          finalCommand = `powershell -ExecutionPolicy Bypass -File ${finalCommand}`;
        }

        const child = spawn(finalCommand, {
          shell: true,
          cwd: process.cwd(),
          env: { ...process.env, TOOL_INPUT: JSON.stringify(args) },
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => stdout += data.toString());
        child.stderr?.on('data', (data) => stderr += data.toString());

        child.on('close', (code) => {
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`Exit ${code}: ${stderr.trim()}`));
        });

        child.stdin?.write(JSON.stringify(args));
        child.stdin?.end();
      });
    }
  };
}

/**
 * Recursively search for a documentation file (.md or .json) for a given tool name
 */
async function findDocInDir(dir: string, baseName: string): Promise<{ content: string, file: string } | null> {
  const files = await readdir(dir);
  for (const f of files) {
    if (basename(f, extname(f)) === baseName && (f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.txt'))) {
      const content = await readFile(join(dir, f), 'utf-8');
      return { content, file: f };
    }
  }
  return null;
}

// Helper to load tools from a specific directory (recursive)
async function loadToolsFromDir(dir: string, source: 'builtin' | 'project'): Promise<Map<string, Tool>> {
  const tools = new Map<string, Tool>();

  try {
    const items = await readdir(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const s = await stat(fullPath);

      if (s.isDirectory()) {
        // Recursive call for subdirectories
        const subTools = await loadToolsFromDir(fullPath, source);
        for (const [name, tool] of subTools) {
          tools.set(name, tool);
        }

        // Special case: Folder named ' heavy_lifting' might have 'heavy_lifting.md' inside it
        if (!tools.has(item)) {
          const doc = await findDocInDir(fullPath, item);
          if (doc && doc.file.endsWith('.md')) {
            const meta = parseMarkdownTool(doc.content, doc.file);
            if (meta && meta.command) {
              tools.set(meta.name, createScriptTool(meta, source, doc.content));
            }
          }
        }
        continue;
      }

      const ext = extname(item);
      const base = basename(item, ext);

      // 1. Native Node tools
      if (ext === '.ts' || ext === '.js' || ext === '.mjs') {
        if (item.includes('.test.')) continue;
        try {
          const module = await import(pathToFileURL(fullPath).href);
          const toolDef = module.tool || module;

          if (toolDef.name && toolDef.execute) {
            const schema = toolDef.inputSchema || toolDef.schema;
            tools.set(toolDef.name, {
              name: toolDef.name,
              description: toolDef.description || 'No description',
              permission: toolDef.permission || 'read',
              inputSchema: schema || z.object({}),
              execute: toolDef.execute,
              source,
            });
            continue;
          }
        } catch { /* might be a script, fall through */ }
      }

      // 2. Generic Script with internal docs or companion meta file
      if (ext !== '.md' && ext !== '.txt' && ext !== '.json') {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const internalDoc = extractDocFromComments(content);

          // Check for companion meta file in the SAME directory
          const companion = await findDocInDir(dir, base);
          let meta: any = null;
          let specContent = internalDoc;

          if (companion) {
            if (companion.file.endsWith('.json')) {
              meta = JSON.parse(companion.content);
            } else {
              meta = parseMarkdownTool(companion.content, companion.file);
              specContent = companion.content;
            }
          } else if (internalDoc) {
            meta = parseMarkdownTool(internalDoc, item);
            if (!meta.command) {
              if (ext === '.py') meta.command = `python ${fullPath}`;
              else if (ext === '.sh') meta.command = `bash ${fullPath}`;
              else if (ext === '.ps1') meta.command = `powershell ${fullPath}`;
              else meta.command = fullPath;
            }
          }

          if (meta && meta.name && meta.command) {
            tools.set(meta.name, createScriptTool(meta, source, specContent));
          }
        } catch { /* skip errors */ }
      }

      // 3. Standalone Meta/Documentation Tools
      if (ext === '.json' || ext === '.md' || ext === '.txt') {
        if (Array.from(tools.values()).some(t => t.name === base)) continue;
        try {
          const content = await readFile(fullPath, 'utf-8');
          let meta: any = null;
          if (ext === '.json') {
            meta = JSON.parse(content);
          } else {
            meta = parseMarkdownTool(content, item);
          }
          if (meta && meta.name && meta.command) {
            tools.set(meta.name, createScriptTool(meta, source, content));
          }
        } catch { /* skip */ }
      }
    }
  } catch (error) {
    // Directory might not exist
  }

  return tools;
}

// Load all tools from the tools directory
export const loadTools = async (): Promise<Map<string, Tool>> => {
  const customDirs = ['skills', 'scripts', 'tools', '.simple-cli/tools'];
  const builtinTools = await loadToolsFromDir(TOOLS_DIR, 'builtin');

  const allProjectTools = new Map<string, Tool>();
  for (const d of customDirs) {
    const dirPath = join(process.cwd(), d);
    const tools = await loadToolsFromDir(dirPath, 'project');
    for (const [name, tool] of tools) {
      allProjectTools.set(name, tool);
    }
  }

  return new Map([...builtinTools, ...allProjectTools]);
};

// Load MCP tools and merge with built-in tools
export const loadAllTools = async (): Promise<Map<string, Tool>> => {
  const tools = await loadTools();

  try {
    const mcpManager = getMCPManager();
    const mcpTools = mcpManager.getAllTools();

    for (const mcpTool of mcpTools) {
      const toolName = `mcp_${mcpTool.serverName}_${mcpTool.name}`;

      tools.set(toolName, {
        name: toolName,
        description: mcpTool.description,
        permission: 'execute',
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

  const builtinTools: Tool[] = [];
  const projectTools: Tool[] = [];
  const mcpTools: Tool[] = [];

  for (const tool of tools.values()) {
    if (tool.source === 'mcp') {
      mcpTools.push(tool);
    } else if (tool.source === 'project') {
      projectTools.push(tool);
    } else {
      builtinTools.push(tool);
    }
  }

  if (builtinTools.length > 0) {
    sections.push('## Built-in Tools\n');
    for (const tool of builtinTools) {
      sections.push(formatToolDefinition(tool));
    }
  }

  if (projectTools.length > 0) {
    sections.push('\n## Project Skills (Custom Tools)\n');
    for (const tool of projectTools) {
      sections.push(formatToolDefinition(tool));
    }
  }

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
