/**
 * Tool: writeFiles
 * Write or update files with search/replace support (Aider-style)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';
import { applyEdit } from '../lib/editor.js';

export const name = 'write_files';

export const description = 'Write or modify files. ALWAYS provide an array of objects in the "files" parameter, even for a single file. Each object must have "path" and either "content" (for full write) or "searchReplace" (for edits).';

export const permission = 'write' as const;

const FileWriteSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().optional().describe('Full content to write (for new files or full rewrites)'),
  diff: z.string().optional().describe('Git-style merge diff (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE)'),
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
      } else if (file.diff !== undefined) {
        // Git-style merge diff
        let content = await readFile(file.path, 'utf-8');
        const diff = file.diff;
        const absPath = resolve(file.path);

        // Parse blocks: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
        // Handle both LF and CRLF line endings
        const regex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
        let match;
        let newContent = content;
        let appliedCount = 0;
        let errors = [];

        // Collect all edits first
        const edits = [];
        while ((match = regex.exec(diff)) !== null) {
            edits.push({ search: match[1], replace: match[2] });
        }

        if (edits.length === 0) {
           results.push({
             path: file.path,
             success: false,
             message: `No valid SEARCH/REPLACE blocks found in diff for ${absPath}`
           });
           continue;
        }

        // Apply edits
        for (const edit of edits) {
            const result = applyEdit(newContent, edit.search, edit.replace);
            if (result.success) {
                newContent = result.content;
                appliedCount++;
            } else {
                errors.push(`Failed to apply block: ${result.error || 'Unknown error'}`);
                if (result.suggestion) {
                    errors.push(`Suggestion: ${result.suggestion}`);
                }
            }
        }

        if (appliedCount > 0) {
             await writeFile(file.path, newContent, 'utf-8');
             results.push({
               path: file.path,
               success: true,
               message: `Applied ${appliedCount} diff operation(s) to ${absPath}` + (errors.length > 0 ? `. Errors: ${errors.join('; ')}` : '')
             });
        } else {
             results.push({
               path: file.path,
               success: false,
               message: `Failed to apply any diff operations to ${absPath}. ${errors.join('; ')}`
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
