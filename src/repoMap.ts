/**
 * RepoMap: Symbol-aware context generation
 * Uses ts-morph for TypeScript/JavaScript and RegexParser for others.
 */

import { Project, ScriptTarget } from 'ts-morph';
import { readdir, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface FileMap {
  path: string;
  symbols: string[];
}

interface LanguageParser {
  parse(content: string, filePath: string): string[];
}

class TsParser implements LanguageParser {
  private project: Project;

  constructor() {
    this.project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, allowJs: true },
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true
    });
  }

  parse(content: string, filePath: string): string[] {
    try {
      const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
      const symbols: string[] = [];

      sourceFile.getClasses().forEach((c) => symbols.push(`class ${c.getName()}`));
      sourceFile.getFunctions().forEach((f) => symbols.push(`func ${f.getName()}`));
      sourceFile.getInterfaces().forEach((i) => symbols.push(`interface ${i.getName()}`));
      sourceFile.getTypeAliases().forEach((t) => symbols.push(`type ${t.getName()}`));
      sourceFile.getVariableStatements().forEach((v) => {
        v.getDeclarations().forEach((d) => symbols.push(`const ${d.getName()}`));
      });

      return symbols;
    } catch {
      return [];
    }
  }
}

class RegexParser implements LanguageParser {
  constructor(private patterns: RegExp[]) {}

  parse(content: string): string[] {
    const symbols: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
        for (const pattern of this.patterns) {
            const match = line.match(pattern);
            if (match) {
                // Return the full match for clarity (e.g., "class MyClass")
                symbols.push(match[0].trim());
            }
        }
    }
    return symbols;
  }
}

const PARSERS: Record<string, LanguageParser> = {
    // Python
    '.py': new RegexParser([
        /^\s*class\s+[a-zA-Z0-9_]+/,
        /^\s*def\s+[a-zA-Z0-9_]+/
    ]),
    // Go
    '.go': new RegexParser([
        /^\s*func\s+[a-zA-Z0-9_]+/,
        /^\s*type\s+[a-zA-Z0-9_]+/
    ]),
    // Rust
    '.rs': new RegexParser([
        /^\s*fn\s+[a-zA-Z0-9_]+/,
        /^\s*struct\s+[a-zA-Z0-9_]+/,
        /^\s*enum\s+[a-zA-Z0-9_]+/,
        /^\s*impl\s+[a-zA-Z0-9_]+/,
        /^\s*trait\s+[a-zA-Z0-9_]+/
    ])
};

const tsParser = new TsParser();

export const generateRepoMap = async (rootDir: string = '.' , keywords: string[] = []): Promise<string> => {
  const fileMaps: FileMap[] = [];

  const stack = [rootDir];
  const validFiles: string[] = [];

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
          validFiles.push(fullPath);
        }
      }
    } catch { /* ignore access errors */ }
  }

  // Prioritize files based on keywords
  if (keywords.length > 0) {
      validFiles.sort((a, b) => {
          const aName = relative(rootDir, a).toLowerCase();
          const bName = relative(rootDir, b).toLowerCase();
          const aHas = keywords.some(k => aName.includes(k));
          const bHas = keywords.some(k => bName.includes(k));
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
          return 0;
      });
  }

  // 2. Process Files in parallel
  // Limit to 50 files for now to avoid context explosion
  const filesToProcess = validFiles.slice(0, 50);

  const results = await Promise.all(
    filesToProcess.map(async (filePath) => {
      const ext = extname(filePath);
      const relPath = relative(rootDir, filePath);

      let symbols: string[] = [];

      try {
        const content = await readFile(filePath, 'utf-8');

        if (TS_EXTENSIONS.has(ext)) {
            symbols = tsParser.parse(content, filePath);
        } else if (PARSERS[ext]) {
            symbols = PARSERS[ext].parse(content, filePath);
        }
      } catch {
         // ignore read errors
      }

      return { path: relPath, symbols };
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
