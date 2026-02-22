import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Website Structure and Build', () => {
  const rootDir = process.cwd();
  const websiteDir = path.join(rootDir, 'docs/website');
  const apiDir = path.join(websiteDir, 'api');
  const siteDir = path.join(rootDir, '_site');

  beforeAll(() => {
    // Ensure API docs are generated before running tests
    // This makes the test robust in CI environments that don't run build:docs beforehand
    if (!fs.existsSync(apiDir)) {
      console.log('API docs not found. Generating...');
      try {
        execSync('npm run build:docs', { stdio: 'inherit' });
      } catch (error) {
        console.error('Failed to generate API docs:', error);
        // We don't throw here to let assertions fail naturally if needed,
        // but likely tests will fail if this fails.
      }
    }
  }, 120000); // Increase timeout for build process

  it('should have the correct source structure', () => {
    expect(fs.existsSync(path.join(websiteDir, 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(websiteDir, 'frameworks.md'))).toBe(true);
    expect(fs.existsSync(path.join(websiteDir, 'architecture.md'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, '_config.yml'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'Gemfile'))).toBe(true);
  });

  it('should have generated API documentation', () => {
    // Check if api directory exists and has files
    expect(fs.existsSync(apiDir)).toBe(true);
    const files = fs.readdirSync(apiDir);
    expect(files.length).toBeGreaterThan(0);
    // Check for a sample file, e.g., README.md or index.md or classes
    // Typedoc with markdown plugin usually generates README.md or modules.md
    const hasIndexOrReadme = files.some(f => f.toLowerCase() === 'readme.md' || f.toLowerCase() === 'index.md' || f.toLowerCase() === 'modules.md');
    // If expanding, it might be folders
    const hasFolders = files.some(f => fs.statSync(path.join(apiDir, f)).isDirectory());

    expect(hasIndexOrReadme || hasFolders).toBe(true);
  });

  it('should have built the site (if Jekyll is available)', () => {
    // This test assumes 'bundle exec jekyll build' was attempted.
    // If it failed due to missing Ruby env, we skip or check if _site exists.
    if (fs.existsSync(siteDir)) {
      expect(fs.existsSync(path.join(siteDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(siteDir, 'frameworks.html'))).toBe(true);
      expect(fs.existsSync(path.join(siteDir, 'architecture.html'))).toBe(true);
    } else {
      console.warn('Jekyll build artifact (_site) not found. Skipping build verification.');
    }
  });

  it('should have correct links in index.md', () => {
    const indexContent = fs.readFileSync(path.join(websiteDir, 'index.md'), 'utf-8');
    expect(indexContent).toContain('[View All Integrations](./frameworks.html)');
    expect(indexContent).toContain('[Explore Architecture](./architecture.html)');
  });
});
