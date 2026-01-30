/**
 * Prompt Provider - Manages composition of system prompts
 * Supports built-in defaults, project-specific overrides, and modular personas.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PromptOptions {
    cwd: string;
    skillPrompt?: string;
}

export class PromptProvider {
    /**
     * Builds the full system prompt by composing multiple layers:
     * 1. Built-in system instructions (src/prompts/defaults)
     * 2. Global user overrides (~/.simple/prompts)
     * 3. Project-specific prompts (.simple/prompts)
     * 4. Current skill instructions
     * 5. Local project rules (AGENT.md)
     */
    async getSystemPrompt(options: PromptOptions): Promise<string> {
        const parts: string[] = [];

        // 1. Built-in defaults (Hardcoded in the package)
        const builtInDir = join(__dirname, 'defaults');
        if (existsSync(builtInDir)) {
            parts.push(...this.loadFromDirectory(builtInDir));
        }

        // 2. Global user overrides (~/.simple/prompts)
        const globalDir = join(homedir(), '.simple', 'prompts');
        if (existsSync(globalDir)) {
            parts.push(...this.loadFromDirectory(globalDir));
        }

        // 3. Project-specific overrides (.simple/prompts in project root)
        const projectDir = join(options.cwd, '.simple', 'prompts');
        if (existsSync(projectDir)) {
            parts.push(...this.loadFromDirectory(projectDir));
        }

        // 4. Skill-specific prompt (Dynamic based on @skill)
        if (options.skillPrompt) {
            parts.push('\n## Skill Context: ' + options.skillPrompt);
        }

        // 5. Local project rules (AGENT.md, .cursorrules, etc.)
        const rules = this.loadProjectRules(options.cwd);
        if (rules) {
            parts.push('\n## Project Rules\n' + rules);
        }

        return parts.join('\n\n').trim();
    }

    private loadFromDirectory(dir: string): string[] {
        try {
            return readdirSync(dir)
                .filter(f => f.endsWith('.md') || f.endsWith('.mdc'))
                .sort() // Ensure deterministic order
                .map(f => readFileSync(join(dir, f), 'utf-8'));
        } catch {
            return [];
        }
    }

    private loadProjectRules(cwd: string): string | null {
        const commonPaths = ['AGENT.md', '.agent.md', '.aider/agent.md', '.cursorrules'];
        for (const p of commonPaths) {
            const fullPath = join(cwd, p);
            if (existsSync(fullPath)) {
                return readFileSync(fullPath, 'utf-8');
            }
        }
        return null;
    }
}

let provider: PromptProvider | null = null;
export function getPromptProvider(): PromptProvider {
    if (!provider) {
        provider = new PromptProvider();
    }
    return provider;
}
