/**
 * Tool: writeFiles
 * Write or update files with search/replace support (Aider-style)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';

export const name = 'write_files';

export const description = 'Write or modify files. ALWAYS provide an array of objects in the "files" parameter, even for a single file. Each object must have "path" and either "content" (for full write), "diff" (for Git merge diffs), or "searchReplace" (for simple edits).';

export const permission = 'write' as const;

const FileWriteSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().optional().describe('Full content to write (for new files or full rewrites)'),
  diff: z.string().optional().describe('Git merge diff to apply (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE)'),
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

      const absPath = resolve(file.path);

      if (file.content !== undefined) {
        // Full file write
        await writeFile(file.path, file.content, 'utf-8');
        results.push({
          path: file.path,
          success: true,
          message: `File written successfully to ${absPath}`
        });
      } else if (file.diff !== undefined) {
        // Git merge diff application
        try {
          // If file doesn't exist, we can't apply diff
          let content = await readFile(file.path, 'utf-8');

          // Normalize file content to LF to avoid line ending mismatches
          content = content.replace(/\r\n/g, '\n');

          // Regex to match the block format.
          // We use \r?\n to handle both LF and CRLF.
          // ([\s\S]*?) matches any character including newlines, non-greedy.
          const diffRegex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;

          const matches = [...file.diff.matchAll(diffRegex)];

          if (matches.length === 0) {
             throw new Error('No valid SEARCH/REPLACE blocks found in diff. Ensure you are using the exact format: <<<<<<< SEARCH\\n...\\n=======\\n...\\n>>>>>>> REPLACE');
          }

          let newContent = content;
          let changesApplied = 0;

          for (const m of matches) {
            let searchBlock = m[1];
            const replaceBlock = m[2];

            // Normalize search block to LF
            searchBlock = searchBlock.replace(/\r\n/g, '\n');

            if (newContent.includes(searchBlock)) {
              // Replace only the first occurrence to avoid unintended global replacements.
              // Use callback function for replacement to prevent special character substitution (e.g. $&, $1)
              newContent = newContent.replace(searchBlock, () => replaceBlock);
              changesApplied++;
            } else {
              // Be strict: if a block is not found, fail the whole file operation?
              // Or partial success? Aider usually stops.
              // We'll throw to abort the file update (since we modify newContent in memory first).
              throw new Error(`Search block not found in file (or already modified). Block start: "${searchBlock.substring(0, 50).replace(/\n/g, '\\n')}..."`);
            }
          }

          if (changesApplied > 0) {
            await writeFile(file.path, newContent, 'utf-8');
            results.push({
              path: file.path,
              success: true,
              message: `Applied ${changesApplied} diff block(s) to ${absPath}`
            });
          } else {
             results.push({
                path: file.path,
                success: false,
                message: 'No changes applied (blocks matched format but search content might be identical to replace content?)'
             });
          }

        } catch (err: any) {
           results.push({
             path: file.path,
             success: false,
             message: `Failed to apply diff: ${err.message}`
           });
        }

      } else if (file.searchReplace && file.searchReplace.length > 0) {
        // Search/replace operations
        let content = await readFile(file.path, 'utf-8');
        let changesApplied = 0;

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
