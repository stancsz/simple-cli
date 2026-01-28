/**
 * RepoMap: Symbol-aware context generation
 * Uses ts-morph for TypeScript/JavaScript and simple parsing for others.
 */

import { Project, ScriptTarget } from 'ts-morph';
import { readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface FileMap {
  path: string;
  symbols: string[];
}

export const generateRepoMap = async (rootDir: string = '.'): Promise<string> => {
  const fileMaps: FileMap[] = [];
  // Initialize ts-morph project
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, allowJs: true },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true // Don't actually load files until we say so
  });

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

  // 2. Process Files
  // Limit to 50 files for now to avoid context explosion
  const filesToProcess = validFiles.slice(0, 50);

  for (const filePath of filesToProcess) {
    const ext = extname(filePath);
    const relPath = relative(rootDir, filePath);

    if (TS_EXTENSIONS.has(ext)) {
      try {
        // Use ts-morph
        const sourceFile = project.createSourceFile(filePath, await import('fs/promises').then(fs => fs.readFile(filePath, 'utf-8')), { overwrite: true });
        const symbols: string[] = [];

        sourceFile.getClasses().forEach(c => symbols.push(`class ${c.getName()}`));
        sourceFile.getFunctions().forEach(f => symbols.push(`func ${f.getName()}`));
        sourceFile.getInterfaces().forEach(i => symbols.push(`interface ${i.getName()}`));
        sourceFile.getTypeAliases().forEach(t => symbols.push(`type ${t.getName()}`));
        sourceFile.getVariableStatements().forEach(v => {
          v.getDeclarations().forEach(d => symbols.push(`const ${d.getName()}`));
        });

        if (symbols.length > 0) {
          fileMaps.push({ path: relPath, symbols });
        }
      } catch (e) {
        // Fallback or ignore
      }
    } else {
      // Simple listing for non-TS files? Or just skip symbols to keep it clean.
      // For now, let's just list the file path for completeness if it's source code
      fileMaps.push({ path: relPath, symbols: [] });
    }
  }

  if (fileMaps.length === 0) return 'No source files found.';

  return fileMaps.map(fm => {
    if (fm.symbols.length === 0) return `📄 ${fm.path}`;
    const syms = fm.symbols.map(s => `    ${s}`).join('\n');
    return `📄 ${fm.path}\n${syms}`;
  }).join('\n\n');
};
