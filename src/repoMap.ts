/**
 * RepoMap: Symbol-aware context generation
 * Uses ts-morph for TypeScript/JavaScript and simple parsing for others.
 */

import { Project, ScriptTarget } from 'ts-morph';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative, basename } from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface FileMap {
  path: string;
  symbols: string[];
}

interface ScoredFile {
  path: string;
  score: number;
}

function computeScore(filePath: string, keywords: string[]): number {
  if (!keywords || keywords.length === 0) return 0;

  let score = 0;
  const lowerPath = filePath.toLowerCase();
  const filename = basename(filePath).toLowerCase();
  const nameNoExt = filename.replace(/\.[^/.]+$/, "");

  for (const keyword of keywords) {
    const k = keyword.toLowerCase();

    // Exact filename match (strongest signal)
    if (nameNoExt === k) {
      score += 10;
    }
    // Partial filename match
    else if (filename.includes(k)) {
      score += 5;
    }
    // Path match (weakest signal)
    else if (lowerPath.includes(k)) {
      score += 1;
    }
  }
  return score;
}

export const generateRepoMap = async (rootDir: string = '.', keywords: string[] = []): Promise<string> => {
  const fileMaps: FileMap[] = [];
  // Initialize ts-morph project
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, allowJs: true },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true // Don't actually load files until we say so
  });

  const stack = [rootDir];
  const allFiles: string[] = [];

  // 1. Walk directory to find files
  while (stack.length > 0) {
    const dir = stack.pop()!;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile()) {
          allFiles.push(fullPath);
        }
      }
    } catch { /* ignore access errors */ }
  }

  // 2. Score and Sort Files
  // Adaptive Mapping: prioritize files matching keywords
  const scoredFiles: ScoredFile[] = allFiles.map(f => ({
    path: f,
    score: computeScore(relative(rootDir, f), keywords)
  }));

  // Sort by score desc, then by path length (shorter is usually more relevant/root), then alphabetical
  scoredFiles.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path.localeCompare(b.path);
  });

  // Limit to 50 files
  const filesToProcess = scoredFiles.slice(0, 50).map(sf => sf.path);

  const results = await Promise.all(
    filesToProcess.map(async (filePath) => {
      const ext = extname(filePath);
      const relPath = relative(rootDir, filePath);

      if (TS_EXTENSIONS.has(ext)) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
          const symbols: string[] = [];

          sourceFile.getClasses().forEach((c) => symbols.push(`class ${c.getName()}`));
          sourceFile.getFunctions().forEach((f) => symbols.push(`func ${f.getName()}`));
          sourceFile.getInterfaces().forEach((i) => symbols.push(`interface ${i.getName()}`));
          sourceFile.getTypeAliases().forEach((t) => symbols.push(`type ${t.getName()}`));
          sourceFile.getVariableStatements().forEach((v) => {
            v.getDeclarations().forEach((d) => symbols.push(`const ${d.getName()}`));
          });

          return { path: relPath, symbols };
        } catch (e) {
          return null;
        }
      } else {
        return { path: relPath, symbols: [] };
      }
    })
  );

  for (const res of results) {
    if (res) fileMaps.push(res);
  }

  if (fileMaps.length === 0) return 'No source files found.';

  return fileMaps.map(fm => {
    if (fm.symbols.length === 0) return `📄 ${fm.path}`;
    const syms = fm.symbols.map(s => `    ${s}`).join('\n');
    return `📄 ${fm.path}\n${syms}`;
  }).join('\n\n');
};
