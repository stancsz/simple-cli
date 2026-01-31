import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { globSync } from 'glob';
import yaml from 'yaml';
import { execSync } from 'child_process';

/**
 * [Simple-CLI AI-Created]
 * Adapter tool for integrating OpenClaw skills without core modifications.
 */

// Define standard OpenClaw paths
const CLAW_GLOBAL_PATH = join(homedir(), '.openclaw', 'workspace', 'skills');
const CLAW_LOCAL_PATH = join(process.cwd());

export const tool = {
    name: 'claw',
    description: 'Manage and execute OpenClaw skills (Discovery, Inspection, Execution)',
    inputSchema: z.object({
        action: z.enum(['list', 'inspect', 'run']).describe('Operation to perform'),
        skillName: z.string().optional().describe('Name of the skill to inspect or run'),
        args: z.record(z.string(), z.any()).optional().describe('Arguments to pass to the skill when running')
    }),
    execute: async ({ action, skillName, args = {} }) => {
        switch (action) {
            case 'list':
                return listSkills();
            case 'inspect':
                if (!skillName) throw new Error('skillName is required for inspect action');
                return inspectSkill(skillName);
            case 'run':
                if (!skillName) throw new Error('skillName is required for run action');
                return runSkill(skillName, args);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
};

/**
 * Find all SKILL.md files in supported directories
 */
function findSkillFiles(): string[] {
    const globalSkills = existsSync(CLAW_GLOBAL_PATH)
        ? globSync('**/SKILL.md', { cwd: CLAW_GLOBAL_PATH, absolute: true, windowsPathsNoEscape: true })
        : [];

    // Main recursive scan
    const localSkills = globSync('**/SKILL.md', {
        cwd: CLAW_LOCAL_PATH,
        absolute: true,
        ignore: ['node_modules/**', '.git/**'],
        windowsPathsNoEscape: true
    });

    // Explicit skills scan (just in case main glob missed it due to ignore rules or depth)
    const explicitSkills = globSync('skills/**/SKILL.md', {
        cwd: CLAW_LOCAL_PATH,
        absolute: true,
        windowsPathsNoEscape: true
    });

    return [...new Set([...globalSkills, ...localSkills, ...explicitSkills])];
}

/**
 * List all discoverable skills
 */
function listSkills(): string {
    const files = findSkillFiles();
    if (files.length === 0) return 'No OpenClaw skills found.';

    const summaries = files.map(file => {
        try {
            const content = readFileSync(file, 'utf-8');
            const frontmatter = parseFrontmatter(content);
            return `- **${frontmatter.name || 'Unnamed'}** (${file})\n  ${frontmatter.description || 'No description'}`;
        } catch (e) {
            return `- [Error parsing ${file}]`;
        }
    });

    return `Found ${files.length} skills:\n\n${summaries.join('\n')}`;
}

/**
 * Inspect a specific skill's definition
 */
function inspectSkill(name: string): string {
    const files = findSkillFiles();
    const match = files.find(f => {
        try {
            const content = readFileSync(f, 'utf-8');
            const fm = parseFrontmatter(content);
            return fm.name === name || f.includes(name);
        } catch {
            return false;
        }
    });

    if (!match) return `Skill "${name}" not found.`;

    const content = readFileSync(match, 'utf-8');
    const fm = parseFrontmatter(content);

    return JSON.stringify({
        path: match,
        definition: fm
    }, null, 2);
}

/**
 * Run a skill
 */
function runSkill(name: string, args: Record<string, any>): string {
    const files = findSkillFiles();
    const match = files.find(f => {
        try {
            const content = readFileSync(f, 'utf-8');
            const fm = parseFrontmatter(content);
            return fm.name === name;
        } catch {
            return false;
        }
    });

    if (!match) return `Skill "${name}" not found.`;

    const content = readFileSync(match, 'utf-8');
    const fm = parseFrontmatter(content);
    const command = fm.command || fm.run; // Support variants

    if (!command) return `No execution command defined for skill "${name}"`;

    // Simplistic argument injection (env vars + simplistic templating)
    // Real implementation would need a more robust argument parser matching OpenClaw spec
    const env = {
        ...process.env,
        CLAW_SKILL_PATH: match,
        CLAW_PROJECT_ROOT: CLAW_LOCAL_PATH,
        ...Object.fromEntries(Object.entries(args).map(([k, v]) => [`INPUT_${k.toUpperCase()}`, String(v)]))
    };

    try {
        const output = execSync(command, {
            env,
            cwd: resolve(match, '..'), // Run in skill directory
            encoding: 'utf-8'
        });
        return output;
    } catch (error: any) {
        return `Skill execution failed:\n${error.stdout || ''}\n${error.stderr || error.message}`;
    }
}

/**
 * Simple frontmatter parser
 */
function parseFrontmatter(content: string): any {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    return yaml.parse(match[1]);
}
