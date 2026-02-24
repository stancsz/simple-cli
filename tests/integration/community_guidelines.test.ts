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
    // Updated to verify new biological roadmap structure
    expect(roadmapContent).toContain('Technical Constitution');
    expect(roadmapContent).toContain('Phase I: The Metabolism');
    expect(roadmapContent).toContain('Phase II: The Immune System');
    expect(roadmapContent).toContain('Phase III: The Genome');
    expect(roadmapContent).toContain('Phase IV: The Proteome');

    // Also check legacy roadmap for historical context if needed
    const legacyRoadmapPath = join(docsDir, 'ROADMAP_LEGACY.md');
    if (existsSync(legacyRoadmapPath)) {
        const legacyContent = readFileSync(legacyRoadmapPath, 'utf-8');
        expect(legacyContent).toContain('Contribution Guidelines');
        expect(legacyContent).toContain('docs/CONTRIBUTING.md');
    }

    // 4. Verify todo.md update
    const todoContent = readFileSync(todoPath, 'utf-8');
    expect(todoContent).toContain('[x] **Contribution Guidelines**');
});
