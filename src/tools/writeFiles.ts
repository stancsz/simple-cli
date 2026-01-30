/**
 * Tool: writeFiles
 * Write or update files with search/replace support (Aider-style)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';

export const name = 'writeFiles';

export const description = 'Write or modify files. ALWAYS provide an array of objects in the "files" parameter, even for a single file. Each object must have "path" and either "content" (for full write) or "searchReplace" (for edits).';

export const permission = 'write' as const;

const FileWriteSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().optional().describe('Full content to write (for new files or full rewrites)'),
  searchReplace: z.array(z.object({
    search: z.string().describe('Text to search for'),
    replace: z.string().describe('Text to replace with')
  })).optional().describe('Array of search/replace operations for targeted edits')
});

export const schema = z.object({
  files: z.array(FileWriteSchema).describe('Array of files to write/modify')
});

type WriteFilesArgs = z.infer<typeof schema>;

interface WriteResult {
  path: string;
  success: boolean;
  message: string;
}

export const execute = async (args: Record<string, unknown>): Promise<WriteResult[]> => {
  const parsed = schema.parse(args);
  const results: WriteResult[] = [];

  for (const file of parsed.files) {
    try {
      // Ensure directory exists
      await mkdir(dirname(file.path), { recursive: true });

      if (file.content !== undefined) {
        // Full file write
        await writeFile(file.path, file.content, 'utf-8');
        const absPath = resolve(file.path);
        results.push({
          path: file.path,
          success: true,
          message: `File written successfully to ${absPath}`
        });
      } else if (file.searchReplace && file.searchReplace.length > 0) {
        // Search/replace operations
        let content = await readFile(file.path, 'utf-8');
        let changesApplied = 0;
        const absPath = resolve(file.path);

        for (const { search, replace } of file.searchReplace) {
          if (content.includes(search)) {
            content = content.replace(search, replace);
            changesApplied++;
          }
        }

        if (changesApplied > 0) {
          await writeFile(file.path, content, 'utf-8');
          results.push({
            path: file.path,
            success: true,
            message: `Applied ${changesApplied} search/replace operation(s) to ${absPath}`
          });
        } else {
          results.push({
            path: file.path,
            success: false,
            message: `No matching search patterns found in ${absPath}`
          });
        }
      } else {
        results.push({
          path: file.path,
          success: false,
          message: 'No content or searchReplace provided'
        });
      }
    } catch (error) {
      results.push({
        path: file.path,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
};
