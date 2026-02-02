/**
 * Tool: readFiles
 * Read contents of one or more files
 */

import { readFile } from 'fs/promises';
import { z } from 'zod';

export const name = 'read_files';
export const description = 'Read the contents of one or more files from the filesystem';

export const permission = 'read' as const;

export const schema = z.object({
  paths: z.array(z.string()).describe('Array of file paths to read'),
  encoding: z.string().optional().describe('File encoding (default: utf-8)')
});

type ReadFilesArgs = z.infer<typeof schema>;

interface FileResult {
  path: string;
  content?: string;
  error?: string;
}

export const execute = async (args: Record<string, unknown>): Promise<FileResult[]> => {
  const parsed = schema.parse(args);
  const encoding = (parsed.encoding || 'utf-8') as BufferEncoding;
  const results: FileResult[] = [];

  for (const path of parsed.paths) {
    try {
      const content = await readFile(path, encoding);
      results.push({ path, content });
    } catch (error) {
      results.push({
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
};
