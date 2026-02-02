import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTools, getToolDefinitions } from '../src/registry.js';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';

describe('Project Skills (Custom Tools)', () => {
    const skillsDir = join(process.cwd(), 'skills');

    beforeEach(async () => {
        if (!existsSync(skillsDir)) {
            await mkdir(skillsDir);
        }
    });

    afterEach(async () => {
        // We don't necessarily want to delete the whole skills dir if it was already there
        // but for the test we'll remove the specific test file
        const testFile = join(skillsDir, 'testSkill.ts');
        if (existsSync(testFile)) {
            await rm(testFile);
        }
    });

    it('should load a custom tool from the skills directory', async () => {
        const testSkillPath = join(skillsDir, 'testSkill.ts');
        const skillContent = `
      import { z } from 'zod';
      export const name = 'testSkill';
      export const description = 'A custom test skill';
      export const schema = z.object({ input: z.string() });
      export const execute = async (args: any) => \`Hello \${args.input}\`;
    `;

        await writeFile(testSkillPath, skillContent);

        const tools = await loadTools();
        expect(tools.has('testSkill')).toBe(true);

        const skill = tools.get('testSkill')!;
        expect(skill.description).toBe('A custom test skill');
        expect(skill.source).toBe('project');

        const result = await skill.execute({ input: 'World' });
        expect(result).toBe('Hello World');
    });

    it('should include project skills in tool definitions', async () => {
        const testSkillPath = join(skillsDir, 'testSkill.ts');
        const skillContent = `
      import { z } from 'zod';
      export const name = 'testSkill';
      export const description = 'A custom test skill';
      export const schema = z.object({ input: z.string() });
      export const execute = async (args: any) => \`Hello \${args.input}\`;
    `;

        await writeFile(testSkillPath, skillContent);

        const tools = await loadTools();
        const definitions = getToolDefinitions(tools);

        expect(definitions).toContain('## Project Skills (Custom Tools)');
        expect(definitions).toContain('### testSkill');
        expect(definitions).toContain('A custom test skill');
    });

    it('should reload tools via the reloadTools tool', async () => {
        const { getContextManager } = await import('../src/context.js');
        const { execute: reloadExecute } = await import('../src/tools/reload_tools.js');

        const ctx = getContextManager();
        await ctx.initialize();

        // Initial tools should NOT have testSkill2
        expect(ctx.getTools().has('testSkill2')).toBe(false);

        // Create new skill
        const testSkillPath = join(skillsDir, 'testSkill2.ts');
        const skillContent = `
      import { z } from 'zod';
      export const name = 'testSkill2';
      export const execute = async () => 'OK';
    `;
        await writeFile(testSkillPath, skillContent);

        // Execute reload
        const result = await reloadExecute({});
        expect(result).toContain('reloaded');

        // Now it should have it
        expect(ctx.getTools().has('testSkill2')).toBe(true);

        // Cleanup
        await rm(testSkillPath);
    });
});
