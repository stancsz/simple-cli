/**
 * Tool: create_tool
 * Saves a script as a reusable tool for future sessions.
 * Supports local (.simple/tools) and global (~/.simple/tools) scopes.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { getContextManager } from '../context.js';
import type { Tool } from '../registry.js';

export const name = 'create_tool';
export const description = 'Save a script as a reusable tool in the agent\'s toolbox. Tools can be scoped to the current project (local) or available globally.';
export const permission = 'write' as const;

export const inputSchema = z.object({
  source_path: z.string().describe('Path to the script file in the current workspace to save.'),
  name: z.string().describe('Name of the tool (snake_case preferred).'),
  description: z.string().describe('Description of what the tool does.'),
  usage: z.string().describe('Usage instructions or examples.'),
  scope: z.enum(['local', 'global']).optional().default('local').describe('Scope of the tool: "local" (project .simple/tools) or "global" (~/.simple/tools). Defaults to local.'),
  parameters: z.record(z.object({
    type: z.string().describe('Type of the parameter (string, number, boolean, etc.)'),
    description: z.string().describe('Description of the parameter')
  })).optional().describe('Optional parameters definition for the tool.')
});

export const execute = async (args: Record<string, unknown>): Promise<string> => {
  const { source_path, name: toolName, description: toolDesc, usage, scope, parameters } = inputSchema.parse(args);

  const cwd = process.cwd();
  const fullSourcePath = resolve(cwd, source_path);

  // Read source file
  let content = '';
  try {
    content = await readFile(fullSourcePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read source file: ${source_path}. Error: ${error}`);
  }

  // Generate DocBlock
  const ext = extname(source_path);

  // Format parameters for the doc block
  let paramsStr = '';
  if (parameters) {
    paramsStr = '\n## Parameters\n';
    for (const [key, val] of Object.entries(parameters)) {
      paramsStr += `- ${key}: ${val.type} - ${val.description}\n`;
    }
  }

  const fullDoc = `# ${toolName}\n${toolDesc}\n\nUsage: ${usage}\n${paramsStr}`;
  let docBlock = '';
  let commentPrefix = '';
  let blockStart = '';
  let blockEnd = '';

  if (ext === '.py') {
    blockStart = '"""\n';
    blockEnd = '\n"""\n';
  } else if (ext === '.js' || ext === '.ts') {
    blockStart = '/**\n';
    blockEnd = '\n*/\n';
  } else {
    commentPrefix = '# ';
  }

  // Construct the doc block string
  if (blockStart) {
    docBlock = blockStart + fullDoc + blockEnd;
  } else {
    docBlock = fullDoc.split('\n').map(l => commentPrefix + l).join('\n') + '\n';
  }

  // Insert doc block, handling shebang if present
  if (content.startsWith('#!')) {
    const idx = content.indexOf('\n');
    if (idx !== -1) {
      const shebang = content.slice(0, idx + 1);
      const rest = content.slice(idx + 1);
      content = shebang + '\n' + docBlock + rest;
    } else {
      content = content + '\n' + docBlock;
    }
  } else {
    content = docBlock + content;
  }

  // Determine target path
  let toolsDir = '';
  if (scope === 'global') {
      const home = homedir();
      toolsDir = join(home, '.simple', 'tools');
  } else {
      toolsDir = join(cwd, '.simple', 'tools');
  }

  await mkdir(toolsDir, { recursive: true });

  // Sanitize tool name to prevent path traversal
  const safeToolName = basename(toolName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFilename = safeToolName + ext;
  const finalTargetPath = join(toolsDir, targetFilename);

  await writeFile(finalTargetPath, content, 'utf-8');

  // Trigger reload if possible
  try {
      const ctx = getContextManager();
      await ctx.initialize();
  } catch {
      // If context manager isn't available (e.g. unit test), ignore
  }

  return `Tool '${toolName}' successfully saved to ${finalTargetPath} (${scope} scope) and loaded into the toolkit.`;
};

export const tool: Tool = {
    name: 'create_tool',
    description: description,
    inputSchema,
    permission: permission,
    execute: async (args) => execute(args as Record<string, unknown>)
};
