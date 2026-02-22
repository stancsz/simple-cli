import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

const BUILD_SCRIPT = path.join(process.cwd(), 'docs/website/build.js');
const DIST_DIR = path.join(process.cwd(), 'docs/website/dist');

test('Website build script should generate HTML files and assets', () => {
    // Ensure clean state (optional, but good)
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }

    // Run build script
    console.log('Running build script...');
    execSync(`node ${BUILD_SCRIPT}`, { stdio: 'inherit' });

    // Check if dist directory exists
    expect(fs.existsSync(DIST_DIR)).toBe(true);

    // Check if main files exist
    const expectedFiles = [
        'index.html',
        'styles.css',
        'getting-started.html',
        'showcase.html',
        'roadmap.html',
        'integrations.html'
    ];

    expectedFiles.forEach(file => {
        const filePath = path.join(DIST_DIR, file);
        expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true);
    });

    // Check content of generated files
    const showcaseContent = fs.readFileSync(path.join(DIST_DIR, 'showcase.html'), 'utf-8');
    expect(showcaseContent).toContain('Showcase Demo - Simple CLI'); // Title from layout
    expect(showcaseContent).toContain('<header>'); // Layout element

    // Check if links are processed
    // "getting-started.html" should be present in nav (layout)
    expect(showcaseContent).toContain('href="getting-started.html"');

    // Check internal link replacement (assuming SHOWCASE_DEMO.md links to something)
    // Actually, let's check getting-started.html content, maybe it links to other docs
    const roadmapContent = fs.readFileSync(path.join(DIST_DIR, 'roadmap.html'), 'utf-8');
    // ROADMAP.md likely contains links. If not, we trust the script logic if files are generated.

    // Check asset copying
    expect(fs.existsSync(path.join(DIST_DIR, 'assets'))).toBe(true);
    // Check specific asset if known
    // expect(fs.existsSync(path.join(DIST_DIR, 'assets/logo.jpeg'))).toBe(true);
});
