import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SOURCE_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const DOCS_DIR = path.resolve(__dirname, '../../docs'); // Go up to repo root/docs
const ASSETS_DIR = path.join(DOCS_DIR, 'assets');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

const DIST_ASSETS = path.join(DIST_DIR, 'assets');
if (!fs.existsSync(DIST_ASSETS)) {
    fs.mkdirSync(DIST_ASSETS, { recursive: true });
}

// Copy assets from docs/assets
if (fs.existsSync(ASSETS_DIR)) {
    fs.cpSync(ASSETS_DIR, DIST_ASSETS, { recursive: true });
    console.log('Copied docs/assets to dist/assets');
}

// Copy static files from src
if (fs.existsSync(path.join(SOURCE_DIR, 'styles.css'))) {
    fs.copyFileSync(path.join(SOURCE_DIR, 'styles.css'), path.join(DIST_DIR, 'styles.css'));
}
if (fs.existsSync(path.join(SOURCE_DIR, 'index.html'))) {
    fs.copyFileSync(path.join(SOURCE_DIR, 'index.html'), path.join(DIST_DIR, 'index.html'));
}

// Copy src/assets if it exists (e.g. logo)
const SRC_ASSETS = path.join(SOURCE_DIR, 'assets');
if (fs.existsSync(SRC_ASSETS)) {
    fs.cpSync(SRC_ASSETS, DIST_ASSETS, { recursive: true });
    console.log('Copied src/assets to dist/assets');
}

// Copy benchmarks
const BENCHMARKS_DIR = path.join(DOCS_DIR, 'benchmarks');
const DIST_BENCHMARKS = path.join(DIST_DIR, 'benchmarks');
if (fs.existsSync(BENCHMARKS_DIR)) {
    if (!fs.existsSync(DIST_BENCHMARKS)) {
        fs.mkdirSync(DIST_BENCHMARKS, { recursive: true });
    }
    fs.cpSync(BENCHMARKS_DIR, DIST_BENCHMARKS, { recursive: true });
    console.log('Copied docs/benchmarks to dist/benchmarks');
}

console.log('Copied static files');

// Read layout
let layout = '';
if (fs.existsSync(path.join(SOURCE_DIR, 'layout.html'))) {
    layout = fs.readFileSync(path.join(SOURCE_DIR, 'layout.html'), 'utf-8');
} else {
    console.error('layout.html not found');
    process.exit(1);
}

// Define mappings
const pages = [
    { src: 'GETTING_STARTED.md', dest: 'getting-started.html', title: 'Getting Started' },
    { src: 'SHOWCASE_DEMO.md', dest: 'showcase.html', title: 'Showcase Demo' },
    { src: 'ROADMAP.md', dest: 'roadmap.html', title: 'Roadmap' },
    { src: 'FRAMEWORK_INTEGRATION.md', dest: 'integrations.html', title: 'Integrations' }
];

// Helper to replace links
const processLinks = (html) => {
    // 1. Replace specific file links
    let processed = html
        .replace(/GETTING_STARTED\.md/g, 'getting-started.html')
        .replace(/SHOWCASE_DEMO\.md/g, 'showcase.html')
        .replace(/ROADMAP\.md/g, 'roadmap.html')
        .replace(/FRAMEWORK_INTEGRATION\.md/g, 'integrations.html');

    // 2. Generic .md -> .html replacement
    processed = processed.replace(/href="([^"]+)\.md"/g, (match, p1) => {
        // Only replace if it doesn't look like an external link
        if (p1.startsWith('http') || p1.startsWith('//')) return match;
        return `href="${p1}.html"`;
    });

    return processed;
};

// Build pages
for (const page of pages) {
    const srcPath = path.join(DOCS_DIR, page.src);
    if (fs.existsSync(srcPath)) {
        const markdown = fs.readFileSync(srcPath, 'utf-8');
        // Convert markdown to HTML
        let htmlContent = marked.parse(markdown);

        // Process links
        htmlContent = processLinks(htmlContent);

        // Inject into layout
        const finalHtml = layout
            .replace('{{title}}', page.title)
            .replace('{{content}}', htmlContent);

        fs.writeFileSync(path.join(DIST_DIR, page.dest), finalHtml);
        console.log(`Generated ${page.dest}`);
    } else {
        console.warn(`Source file not found: ${srcPath}`);
    }
}

console.log('Build complete!');
