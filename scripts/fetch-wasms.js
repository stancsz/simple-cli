import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const wasmDir = path.join(rootDir, 'wasm');

if (!fs.existsSync(wasmDir)) {
  fs.mkdirSync(wasmDir, { recursive: true });
}

const languages = {
  python: 'https://unpkg.com/tree-sitter-python/tree-sitter-python.wasm',
  go: 'https://unpkg.com/tree-sitter-go/tree-sitter-go.wasm',
  rust: 'https://unpkg.com/tree-sitter-rust/tree-sitter-rust.wasm',
  java: 'https://unpkg.com/tree-sitter-java/tree-sitter-java.wasm',
  c: 'https://unpkg.com/tree-sitter-c/tree-sitter-c.wasm',
  cpp: 'https://unpkg.com/tree-sitter-cpp/tree-sitter-cpp.wasm',
};

// Copy tree-sitter.wasm
try {
  // Resolve web-tree-sitter package location
  const mainPath = require.resolve('web-tree-sitter');
  const pkgDir = path.dirname(mainPath);
  const treeSitterPath = path.join(pkgDir, 'web-tree-sitter.wasm');

  const destPath = path.join(wasmDir, 'tree-sitter.wasm');
  fs.copyFileSync(treeSitterPath, destPath);
  console.log(`Copied web-tree-sitter.wasm to ${destPath}`);
} catch (e) {
  console.error('Failed to copy tree-sitter.wasm:', e);
  process.exit(1);
}

// Download languages
async function download(name, url) {
  console.log(`Downloading ${name} from ${url}...`);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dest = path.join(wasmDir, `tree-sitter-${name}.wasm`);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved ${dest} (${buffer.length} bytes)`);
  } catch (err) {
      console.error(`Error downloading ${name}:`, err.message);
      // We might want to fallback or retry? For now just log.
      process.exitCode = 1;
  }
}

(async () => {
  for (const [name, url] of Object.entries(languages)) {
    await download(name, url);
  }
})();
