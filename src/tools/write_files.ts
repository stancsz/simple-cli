/**
 * Tool: writeFiles
 * Write or update files with search/replace support (Aider-style)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';
import { getContextManager } from '../context.js';

export const name = 'write_files';

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
  const ctx = getContextManager();
  const isStaging = ctx.isStagingMode();

  for (const file of parsed.files) {
    try {
      let targetPath = file.path;
      let readPath = file.path;

      if (isStaging) {
        targetPath = ctx.getStagedPath(file.path);
        // For reading, we want the staged version if it exists, otherwise the original
        readPath = ctx.getStagedOrOriginalPath(file.path);
      }

      // Ensure directory exists
      await mkdir(dirname(targetPath), { recursive: true });

      if (file.content !== undefined) {
        // Full file write
        await writeFile(targetPath, file.content, 'utf-8');
        const absPath = resolve(targetPath);
        results.push({
          path: file.path,
          success: true,
          message: `File written successfully to ${absPath}` + (isStaging ? ' (STAGED)' : '')
        });
      } else if (file.searchReplace && file.searchReplace.length > 0) {
        // Search/replace operations
        let content = await readFile(readPath, 'utf-8');
        let changesApplied = 0;
        const absPath = resolve(targetPath);

        for (const { search, replace } of file.searchReplace) {
          if (content.includes(search)) {
            // Apply replacement to all occurrences
            const newContent = content.replaceAll(search, replace);
            if (newContent !== content) {
              content = newContent;
              changesApplied++;
            }
          }
        }

        if (changesApplied > 0) {
          await writeFile(targetPath, content, 'utf-8');
          results.push({
            path: file.path,
            success: true,
            message: `Applied ${changesApplied} search/replace operation(s) to ${absPath}` + (isStaging ? ' (STAGED)' : '')
          });
        } else {
          results.push({
            path: file.path,
            success: false,
            message: `No matching search patterns found in ${readPath}`
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
