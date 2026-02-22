import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

test('Community Guidelines Documentation Validation', () => {
    const docsDir = join(process.cwd(), 'docs');
    const contributingPath = join(docsDir, 'CONTRIBUTING.md');
    const roadmapPath = join(docsDir, 'ROADMAP.md');
    const gettingStartedPath = join(docsDir, 'GETTING_STARTED.md');
    const todoPath = join(docsDir, 'todo.md');

    // 1. Verify CONTRIBUTING.md exists
    expect(existsSync(contributingPath), 'CONTRIBUTING.md should exist').toBe(true);

    // 2. Verify Content of CONTRIBUTING.md
    const contributingContent = readFileSync(contributingPath, 'utf-8');

    // Check for key sections
    expect(contributingContent).toContain('Development Setup');
    expect(contributingContent).toContain('Architecture Overview');
    expect(contributingContent).toContain('Pull Request Process');
    expect(contributingContent).toContain('Testing Mandates');
    expect(contributingContent).toContain('Framework Integration');
    expect(contributingContent).toContain('Code Standards');
    expect(contributingContent).toContain('Documentation');
    expect(contributingContent).toContain('Community Channels');

    // Check for references to other docs
    expect(contributingContent).toContain('docs/FRAMEWORK_INTEGRATION.md');
    expect(contributingContent).toContain('docs/ROADMAP.md');
    expect(contributingContent).toContain('docs/GETTING_STARTED.md');

    // 3. Verify ROADMAP.md update
    const roadmapContent = readFileSync(roadmapPath, 'utf-8');
    expect(roadmapContent).toContain('Contribution Guidelines');
    expect(roadmapContent).toContain('docs/CONTRIBUTING.md');
    expect(roadmapContent).toContain('(✅ Completed)');

    // 4. Verify todo.md update
    const todoContent = readFileSync(todoPath, 'utf-8');
    expect(todoContent).toContain('[x] **Contribution Guidelines**');
});
