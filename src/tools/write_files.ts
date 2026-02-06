/**
 * Tool: writeFiles
 * Write or update files with search/replace support (Aider-style)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';

export const name = 'write_files';

export const description = 'Write or modify files. ALWAYS provide an array of objects in the "files" parameter, even for a single file. Each object must have "path" and either "content" (for full write), "searchReplace" (simple edits), or "diff" (Git Merge Diff format).';

export const permission = 'write' as const;

const FileWriteSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().optional().describe('Full content to write (for new files or full rewrites)'),
  searchReplace: z.array(z.object({
    search: z.string().describe('Text to search for'),
    replace: z.string().describe('Text to replace with')
  })).optional().describe('Array of search/replace operations for targeted edits'),
  diff: z.string().optional().describe('Git Merge Diff format string containing <<<<<<< SEARCH, =======, and >>>>>>> REPLACE blocks')
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

const SEARCH_MARKER = '<<<<<<< SEARCH';
const DIVIDER_MARKER = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

async function applyGitDiff(content: string, diff: string): Promise<{ success: boolean; content: string; message?: string }> {
  const lines = diff.split('\n');
  let currentContent = content;
  let lineIdx = 0;
  let editsApplied = 0;

  while (lineIdx < lines.length) {
    const line = lines[lineIdx];

    if (line.trim() === SEARCH_MARKER) {
      lineIdx++;
      const searchLines: string[] = [];
      const replaceLines: string[] = [];

      // Parse SEARCH block
      while (lineIdx < lines.length && lines[lineIdx].trim() !== DIVIDER_MARKER) {
        searchLines.push(lines[lineIdx]);
        lineIdx++;
      }

      if (lineIdx >= lines.length) {
         return { success: false, content: currentContent, message: 'Unexpected end of diff: missing ======= marker' };
      }
      lineIdx++; // Skip DIVIDER

      // Parse REPLACE block
      while (lineIdx < lines.length && lines[lineIdx].trim() !== REPLACE_MARKER) {
        replaceLines.push(lines[lineIdx]);
        lineIdx++;
      }

      if (lineIdx >= lines.length) {
         return { success: false, content: currentContent, message: 'Unexpected end of diff: missing >>>>>>> REPLACE marker' };
      }

      const searchBlock = searchLines.join('\n');
      const replaceBlock = replaceLines.join('\n');

      if (currentContent.includes(searchBlock)) {
        currentContent = currentContent.replace(searchBlock, replaceBlock);
        editsApplied++;
      } else {
        return {
            success: false,
            content: currentContent,
            message: `Could not find exact match for search block:\n${searchBlock.slice(0, 100)}...`
        };
      }
    } else {
      lineIdx++;
    }
  }

  if (editsApplied === 0) {
     return { success: false, content: currentContent, message: 'No diff blocks found or applied' };
  }

  return { success: true, content: currentContent };
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
      } else if (file.diff !== undefined) {
        // Git Merge Diff
        try {
            const content = await readFile(file.path, 'utf-8');
            const result = await applyGitDiff(content, file.diff);

            if (result.success) {
                await writeFile(file.path, result.content, 'utf-8');
                results.push({
                    path: file.path,
                    success: true,
                    message: `Applied diff successfully to ${resolve(file.path)}`
                });
            } else {
                results.push({
                    path: file.path,
                    success: false,
                    message: `Failed to apply diff: ${result.message}`
                });
            }
        } catch (err) {
             results.push({
                path: file.path,
                success: false,
                message: `Error applying diff: ${err instanceof Error ? err.message : String(err)}`
            });
        }
      } else if (file.searchReplace && file.searchReplace.length > 0) {
        // Search/replace operations
        let content = await readFile(file.path, 'utf-8');
        let changesApplied = 0;
        const absPath = resolve(file.path);

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
          message: 'No content, diff, or searchReplace provided'
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
