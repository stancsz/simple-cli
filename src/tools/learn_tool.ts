/**
 * Tool: learn_tool
 * Saves a script as a reusable tool for future sessions.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { z } from 'zod';
import { getContextManager } from '../context.js';

export const name = 'learn_tool';
export const description = 'Save a script as a reusable tool in the permanent toolbox (~/.simple/tools). Use this when you have created a script that might be useful for future tasks.';
export const permission = 'write' as const;

export const schema = z.object({
  source_path: z.string().describe('Path to the script file in the current workspace to save.'),
  name: z.string().describe('Name of the tool (snake_case preferred).'),
  description: z.string().describe('Description of what the tool does.'),
  usage: z.string().describe('Usage instructions or examples.'),
  parameters: z.record(z.object({
    type: z.string().describe('Type of the parameter (string, number, boolean, etc.)'),
    description: z.string().describe('Description of the parameter')
  })).optional().describe('Optional parameters definition for the tool.')
});

export const execute = async (args: Record<string, unknown>): Promise<string> => {
  const { source_path, name: toolName, description: toolDesc, usage, parameters } = schema.parse(args);

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
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error('Could not determine home directory.');

  const simpleToolsDir = join(home, '.simple', 'tools');
  await mkdir(simpleToolsDir, { recursive: true });

  // Sanitize tool name to prevent path traversal
  const safeToolName = basename(toolName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFilename = safeToolName + ext;
  const finalTargetPath = join(simpleToolsDir, targetFilename);

  await writeFile(finalTargetPath, content, 'utf-8');

  // Trigger reload
  const ctx = getContextManager();
  await ctx.initialize();

  return `Tool '${toolName}' successfully saved to ${finalTargetPath} and loaded into the toolkit.`;
};
