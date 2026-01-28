/**
 * Intelligent Code Editor using ts-morph and fuzzy matching
 * Provides Aider-style SEARCH/REPLACE with smart matching
 */

import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, extname } from 'path';
import * as diff from 'diff';
import levenshtein from 'fast-levenshtein';

export interface EditBlock {
  file: string;
  search: string;
  replace: string;
}

export interface EditResult {
  file: string;
  success: boolean;
  applied: boolean;
  error?: string;
  diff?: string;
  suggestion?: string;
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  const distance = levenshtein.get(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Find the most similar chunk in content
 */
function findMostSimilarChunk(
  content: string,
  search: string,
  threshold: number = 0.6
): { start: number; end: number; similarity: number; text: string } | null {
  const contentLines = content.split('\n');
  const searchLines = search.split('\n');
  const searchLen = searchLines.length;
  
  let bestMatch = { start: -1, end: -1, similarity: 0, text: '' };
  
  // Sliding window search
  for (let i = 0; i <= contentLines.length - searchLen; i++) {
    const chunk = contentLines.slice(i, i + searchLen).join('\n');
    const sim = similarity(chunk, search);
    
    if (sim > bestMatch.similarity) {
      bestMatch = {
        start: i,
        end: i + searchLen,
        similarity: sim,
        text: chunk,
      };
    }
  }
  
  // Also try with flexible window sizes (+/- 2 lines)
  for (let delta = -2; delta <= 2; delta++) {
    if (delta === 0) continue;
    const adjustedLen = searchLen + delta;
    if (adjustedLen < 1) continue;
    
    for (let i = 0; i <= contentLines.length - adjustedLen; i++) {
      const chunk = contentLines.slice(i, i + adjustedLen).join('\n');
      const sim = similarity(chunk, search);
      
      if (sim > bestMatch.similarity) {
        bestMatch = {
          start: i,
          end: i + adjustedLen,
          similarity: sim,
          text: chunk,
        };
      }
    }
  }
  
  if (bestMatch.similarity >= threshold) {
    return bestMatch;
  }
  
  return null;
}

/**
 * Handle whitespace-flexible matching
 */
function matchWithFlexibleWhitespace(
  contentLines: string[],
  searchLines: string[]
): { start: number; end: number; indent: string } | null {
  // Strip leading whitespace from search to compare content only
  const strippedSearch = searchLines.map(line => line.trimStart());
  const searchLen = searchLines.length;
  
  for (let i = 0; i <= contentLines.length - searchLen; i++) {
    const chunk = contentLines.slice(i, i + searchLen);
    const strippedChunk = chunk.map(line => line.trimStart());
    
    // Check if content matches when ignoring leading whitespace
    if (strippedChunk.every((line, idx) => line === strippedSearch[idx])) {
      // Calculate the indent difference
      const firstNonEmptyIdx = chunk.findIndex(line => line.trim());
      if (firstNonEmptyIdx >= 0) {
        const actualIndent = chunk[firstNonEmptyIdx].match(/^(\s*)/)?.[1] || '';
        const searchIndent = searchLines[firstNonEmptyIdx].match(/^(\s*)/)?.[1] || '';
        const indentDiff = actualIndent.slice(0, actualIndent.length - searchIndent.length);
        
        return {
          start: i,
          end: i + searchLen,
          indent: indentDiff,
        };
      }
      
      return { start: i, end: i + searchLen, indent: '' };
    }
  }
  
  return null;
}

/**
 * Apply indent adjustment to replacement text
 */
function applyIndent(text: string, indent: string): string {
  return text
    .split('\n')
    .map(line => (line.trim() ? indent + line : line))
    .join('\n');
}

/**
 * Handle ... (ellipsis) in search/replace blocks
 */
function handleEllipsis(content: string, search: string, replace: string): string | null {
  const dotsPattern = /^\s*\.\.\.\s*$/m;
  
  if (!dotsPattern.test(search)) {
    return null;
  }
  
  const searchParts = search.split(dotsPattern);
  const replaceParts = replace.split(dotsPattern);
  
  if (searchParts.length !== replaceParts.length) {
    return null;
  }
  
  let result = content;
  
  for (let i = 0; i < searchParts.length; i++) {
    const searchPart = searchParts[i].trim();
    const replacePart = replaceParts[i].trim();
    
    if (!searchPart && !replacePart) continue;
    
    if (!searchPart && replacePart) {
      // Append to end
      result = result.trimEnd() + '\n' + replacePart;
      continue;
    }
    
    if (!result.includes(searchPart)) {
      return null;
    }
    
    result = result.replace(searchPart, replacePart);
  }
  
  return result;
}

/**
 * Apply a single edit to content
 */
export function applyEdit(content: string, search: string, replace: string): {
  success: boolean;
  content: string;
  method: string;
  suggestion?: string;
} {
  // Normalize line endings
  content = content.replace(/\r\n/g, '\n');
  search = search.replace(/\r\n/g, '\n').trim();
  replace = replace.replace(/\r\n/g, '\n');
  
  // 1. Try exact match
  if (content.includes(search)) {
    return {
      success: true,
      content: content.replace(search, replace),
      method: 'exact',
    };
  }
  
  // 2. Try ellipsis handling
  const ellipsisResult = handleEllipsis(content, search, replace);
  if (ellipsisResult) {
    return {
      success: true,
      content: ellipsisResult,
      method: 'ellipsis',
    };
  }
  
  // 3. Try whitespace-flexible matching
  const contentLines = content.split('\n');
  const searchLines = search.split('\n');
  
  const wsMatch = matchWithFlexibleWhitespace(contentLines, searchLines);
  if (wsMatch) {
    const adjustedReplace = applyIndent(replace, wsMatch.indent);
    const newLines = [
      ...contentLines.slice(0, wsMatch.start),
      ...adjustedReplace.split('\n'),
      ...contentLines.slice(wsMatch.end),
    ];
    return {
      success: true,
      content: newLines.join('\n'),
      method: 'whitespace-flex',
    };
  }
  
  // 4. Try fuzzy matching
  const fuzzyMatch = findMostSimilarChunk(content, search, 0.7);
  if (fuzzyMatch) {
    const newLines = [
      ...contentLines.slice(0, fuzzyMatch.start),
      ...replace.split('\n'),
      ...contentLines.slice(fuzzyMatch.end),
    ];
    return {
      success: true,
      content: newLines.join('\n'),
      method: `fuzzy (${(fuzzyMatch.similarity * 100).toFixed(0)}% match)`,
    };
  }
  
  // 5. Failed - provide suggestion
  const similarChunk = findMostSimilarChunk(content, search, 0.4);
  let suggestion: string | undefined;
  
  if (similarChunk) {
    suggestion = `Did you mean to match these lines (${(similarChunk.similarity * 100).toFixed(0)}% similar)?

\`\`\`
${similarChunk.text}
\`\`\``;
  }
  
  return {
    success: false,
    content,
    method: 'none',
    suggestion,
  };
}

/**
 * Apply edits to a file
 */
export async function applyFileEdits(edits: EditBlock[]): Promise<EditResult[]> {
  const results: EditResult[] = [];
  const fileContents = new Map<string, string>();
  
  // Group edits by file
  const editsByFile = new Map<string, EditBlock[]>();
  for (const edit of edits) {
    const existing = editsByFile.get(edit.file) || [];
    existing.push(edit);
    editsByFile.set(edit.file, existing);
  }
  
  for (const [file, fileEdits] of editsByFile) {
    // Load file content
    let content: string;
    try {
      if (existsSync(file)) {
        content = await readFile(file, 'utf-8');
      } else {
        // New file - ensure directory exists
        await mkdir(dirname(file), { recursive: true });
        content = '';
      }
    } catch (error) {
      for (const edit of fileEdits) {
        results.push({
          file,
          success: false,
          applied: false,
          error: `Failed to read file: ${error instanceof Error ? error.message : error}`,
        });
      }
      continue;
    }
    
    // Apply each edit
    let currentContent = content;
    let anyApplied = false;
    
    for (const edit of fileEdits) {
      // Handle empty search (new file or append)
      if (!edit.search.trim()) {
        currentContent = currentContent + edit.replace;
        results.push({
          file,
          success: true,
          applied: true,
          diff: `+++ ${file}\n+ ${edit.replace.split('\n').join('\n+ ')}`,
        });
        anyApplied = true;
        continue;
      }
      
      const result = applyEdit(currentContent, edit.search, edit.replace);
      
      if (result.success) {
        const diffText = diff.createPatch(file, currentContent, result.content);
        currentContent = result.content;
        results.push({
          file,
          success: true,
          applied: true,
          diff: diffText,
        });
        anyApplied = true;
      } else {
        results.push({
          file,
          success: false,
          applied: false,
          error: 'SEARCH block did not match any content in file',
          suggestion: result.suggestion,
        });
      }
    }
    
    // Write back if any edits were applied
    if (anyApplied) {
      try {
        await writeFile(file, currentContent);
      } catch (error) {
        results.push({
          file,
          success: false,
          applied: false,
          error: `Failed to write file: ${error instanceof Error ? error.message : error}`,
        });
      }
    }
  }
  
  return results;
}

/**
 * Parse SEARCH/REPLACE blocks from LLM response
 */
export function parseEditBlocks(response: string, validFiles?: string[]): EditBlock[] {
  const blocks: EditBlock[] = [];
  const seen = new Set<string>();  // Track unique blocks by content
  
  // Pattern for <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE inside code fence
  // Captures: filename on line before ```, then search, then replace
  const blockPattern = /([^\n]+)\n```[^\n]*\n<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE\n```/g;
  
  // Also try without code fence (for plain text format)
  const altPattern = /([^\n]+)\n<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  
  const processMatch = (match: RegExpExecArray): void => {
    let file = match[1].trim();
    const search = match[2];
    const replace = match[3];
    
    // Create a unique key for deduplication
    const key = `${search}|||${replace}`;
    if (seen.has(key)) {
      return;  // Skip duplicate
    }
    seen.add(key);
    
    // Clean up filename - strip markdown formatting
    file = file.replace(/^[#*]+\s*/, '');  // Remove leading # and *
    file = file.replace(/`/g, '');  // Remove all backticks
    file = file.replace(/\s*[#*]+$/, '');  // Remove trailing # and *
    file = file.replace(/^(File:\s*|Filename:\s*)/i, '');
    file = file.trim();
    
    // Skip if filename looks like a language hint (e.g., "typescript", "javascript")
    const languageHints = ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'tsx', 'jsx', 'ts', 'js', 'py', 'rb', 'cpp', 'c', 'cs', 'sh', 'bash', 'json', 'yaml', 'yml', 'md', 'html', 'css'];
    if (languageHints.includes(file.toLowerCase())) {
      return;  // Skip - this is likely a language hint, not a filename
    }
    
    // Try to match against valid files
    if (validFiles && validFiles.length > 0) {
      const exactMatch = validFiles.find(f => f === file || f.endsWith('/' + file));
      if (exactMatch) {
        file = exactMatch;
      }
    }
    
    blocks.push({ file, search, replace });
  };
  
  // First try the fenced pattern (more specific)
  let match;
  while ((match = blockPattern.exec(response)) !== null) {
    processMatch(match);
  }
  
  // Then try the alt pattern for any remaining blocks
  while ((match = altPattern.exec(response)) !== null) {
    processMatch(match);
  }
  
  return blocks;
}

/**
 * TypeScript/JavaScript AST-aware editing using ts-morph
 */
export class ASTEditor {
  private project: Project;
  
  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });
  }
  
  /**
   * Add a file to the project
   */
  addFile(path: string, content: string): SourceFile {
    return this.project.createSourceFile(path, content, { overwrite: true });
  }
  
  /**
   * Get or create a source file
   */
  getSourceFile(path: string, content?: string): SourceFile | undefined {
    let sourceFile = this.project.getSourceFile(path);
    if (!sourceFile && content) {
      sourceFile = this.addFile(path, content);
    }
    return sourceFile;
  }
  
  /**
   * Find a function by name
   */
  findFunction(sourceFile: SourceFile, name: string): Node | undefined {
    // Try function declarations
    const funcDecl = sourceFile.getFunction(name);
    if (funcDecl) return funcDecl;
    
    // Try variable declarations with arrow functions
    const varDecl = sourceFile.getVariableDeclaration(name);
    if (varDecl) return varDecl;
    
    // Try method declarations in classes
    for (const classDecl of sourceFile.getClasses()) {
      const method = classDecl.getMethod(name);
      if (method) return method;
    }
    
    return undefined;
  }
  
  /**
   * Find a class by name
   */
  findClass(sourceFile: SourceFile, name: string): Node | undefined {
    return sourceFile.getClass(name);
  }
  
  /**
   * Rename a symbol across the project
   */
  renameSymbol(sourceFile: SourceFile, oldName: string, newName: string): boolean {
    const identifier = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
      .find(id => id.getText() === oldName);
    
    if (identifier) {
      identifier.rename(newName);
      return true;
    }
    return false;
  }
  
  /**
   * Get the modified content of a file
   */
  getContent(path: string): string | undefined {
    return this.project.getSourceFile(path)?.getFullText();
  }
  
  /**
   * Save all changes
   */
  async saveAll(): Promise<void> {
    await this.project.save();
  }
}

/**
 * Create a code editor instance
 */
export function createEditor(): ASTEditor {
  return new ASTEditor();
}
