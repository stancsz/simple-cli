/**
 * RepoMap: Symbol-aware context generation
 * Uses ts-morph for TypeScript/JavaScript and web-tree-sitter for others (Python, Go, Rust, etc.).
 */

import { Project, ScriptTarget } from 'ts-morph';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Parser, Language, Query, Tree } from 'web-tree-sitter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'wasm']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface FileMap {
  path: string;
  symbols: string[];
}

const LANGUAGE_MAP: Record<string, { wasm: string; query: string }> = {
  '.py': {
    wasm: 'tree-sitter-python.wasm',
    query: `
      (function_definition name: (identifier) @name)
      (class_definition name: (identifier) @name)
    `
  },
  '.go': {
    wasm: 'tree-sitter-go.wasm',
    query: `
      (function_declaration name: (identifier) @name)
      (method_declaration name: (field_identifier) @name)
      (type_spec name: (type_identifier) @name)
    `
  },
  '.rs': {
    wasm: 'tree-sitter-rust.wasm',
    query: `
      (function_item name: (identifier) @name)
      (struct_item name: (type_identifier) @name)
      (trait_item name: (type_identifier) @name)
    `
  },
  '.java': {
    wasm: 'tree-sitter-java.wasm',
    query: `
      (class_declaration name: (identifier) @name)
      (method_declaration name: (identifier) @name)
    `
  },
  '.c': {
    wasm: 'tree-sitter-c.wasm',
    query: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name))
    `
  },
  '.cpp': {
    wasm: 'tree-sitter-cpp.wasm',
    query: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name))
      (class_specifier name: (type_identifier) @name)
    `
  }
};

let parserInitialized = false;
// Cache loaded languages
const languageCache: Record<string, Language> = {};

async function initParser() {
  if (parserInitialized) return;
  try {
    // Locate wasm directory relative to this file (src/ or dist/)
    // Assuming structure: /app/dist/repoMap.js -> /app/wasm/
    const wasmRoot = join(__dirname, '..', 'wasm');
    const mainWasm = join(wasmRoot, 'tree-sitter.wasm');

    await Parser.init({
        locateFile: () => mainWasm
    });
    parserInitialized = true;
  } catch (e) {
    console.error("Failed to init web-tree-sitter:", e);
  }
}

async function getSymbolsWithTreeSitter(filePath: string, content: string): Promise<string[]> {
  if (!parserInitialized) await initParser();
  if (!parserInitialized) return [];

  const ext = extname(filePath);
  const langConfig = LANGUAGE_MAP[ext];
  if (!langConfig) return [];

  let parser: Parser | null = null;
  let query: Query | null = null;
  let tree: Tree | null = null;

  try {
    // Load language if not cached
    if (!languageCache[ext]) {
        const wasmPath = join(__dirname, '..', 'wasm', langConfig.wasm);
        const lang = await Language.load(wasmPath);
        languageCache[ext] = lang;
    }

    parser = new Parser();
    parser.setLanguage(languageCache[ext]);
    tree = parser.parse(content);
    query = new Query(languageCache[ext], langConfig.query);
    const captures = query.captures(tree.rootNode);

    // Deduplicate and format
    const symbols = new Set<string>();
    for (const capture of captures) {
        if (capture.name === 'name') {
            symbols.add(`${capture.node.text} (${ext.slice(1)})`);
        }
    }

    return Array.from(symbols);

  } catch (e) {
    console.error(`Error parsing ${filePath}:`, e);
    return [];
  } finally {
    if (query) query.delete();
    if (tree) tree.delete();
    if (parser) parser.delete();
  }
}

export const generateRepoMap = async (rootDir: string = '.'): Promise<string> => {
  await initParser();

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

  // 2. Process Files in parallel
  // Limit to 50 files for now to avoid context explosion
  const filesToProcess = validFiles.slice(0, 50);

  const results = await Promise.all(
    filesToProcess.map(async (filePath) => {
      const ext = extname(filePath);
      const relPath = relative(rootDir, filePath);

      try {
        const content = await readFile(filePath, 'utf-8');

        if (TS_EXTENSIONS.has(ext)) {
            // Use ts-morph
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
        } else if (LANGUAGE_MAP[ext]) {
            // Use Tree-sitter
            const symbols = await getSymbolsWithTreeSitter(filePath, content);
            return { path: relPath, symbols };
        } else {
            return { path: relPath, symbols: [] };
        }
      } catch (e) {
        return null;
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
