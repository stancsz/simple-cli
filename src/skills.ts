import { readFile, readdir, writeFile } from "fs/promises";
import { join, basename, extname } from "path";
import { existsSync } from "fs";

export interface Skill {
  name: string;
  description?: string;
  systemPrompt: string;
  tools?: string[];
}

export const builtinSkills: Record<string, Skill> = {
  code: {
    name: "code",
    description:
      "A Meta Orchestrator that delegates tasks to specialized subagents.",
    systemPrompt: `You are Simple CLI (or just "Simple"), a Meta Orchestrator. When users ask about "Simple", "Simple CLI", or "you", they are referring to you.
You DO NOT have direct access to files, git, or command execution.
You must delegate ALL reading, writing, and execution tasks to subagents.

You must output your response in JSON format.
The JSON should have the following structure:
{
  "thought": "Your reasoning here",
  "tool": "tool_name",
  "args": { "arg_name": "value" }
}
If you don't need to use a tool, use "tool": "none" and provide a "message".
{
  "thought": "Reasoning",
  "tool": "none",
  "message": "Response to user"
}

Important Rules:
1. **Always use tools** to perform actions. Do not just describe what to do.
2. **Delegation**:
   - For reading files, writing files, git operations, or analysis, use 'delegate_cli'.
   - **DEFAULT**: Use 'deepseek_claude' for all standard tasks (reading, writing, assignment, GitHub).
   - **GitHub**: For GitHub tasks (issues, PRs), explicitly delegate to 'deepseek_claude'. It has access to 'gh' CLI tools.
   - Example: To read 'file.txt', call delegate_cli('deepseek_claude', 'Read file.txt').
   - Example: To write a file, call delegate_cli('deepseek_claude', 'Create hello.py with content...').
   - Example: To create a PR, call delegate_cli('deepseek_claude', 'Create a PR for this branch').

3. If you don't need to use a tool, use "tool": "none" and provide a "message".
4. If a task requires multiple steps, perform them one by one.
5. Do not ask for confirmation if you have enough information to proceed.
`,
  },
};

export async function loadSkillFromFile(path: string): Promise<Skill | null> {
  if (!existsSync(path)) return null;
  try {
    const content = await readFile(path, "utf-8");
    const ext = extname(path).toLowerCase();

    if (ext === ".json") {
      const skill = JSON.parse(content);
      if (!skill.name || !skill.systemPrompt) return null;
      return skill;
    } else if (ext === ".md") {
      // Parse markdown:
      // Title (# Title) -> Name
      // Content -> System Prompt
      let name = basename(path, ".md");

      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        name = titleMatch[1].trim();
      }

      return {
        name,
        description: `Loaded from ${basename(path)}`,
        systemPrompt: content,
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function getActiveSkill(
  cwd: string = process.cwd(),
): Promise<Skill> {
  // 1. Env var
  if (process.env.SIMPLE_CLI_SKILL) {
    if (builtinSkills[process.env.SIMPLE_CLI_SKILL]) {
      return builtinSkills[process.env.SIMPLE_CLI_SKILL];
    }
  }

  // 2. Project config (.agent/AGENT.md or .agent/SOUL.md)
  const agentMd = join(cwd, ".agent", "AGENT.md");
  if (existsSync(agentMd)) {
    const skill = await loadSkillFromFile(agentMd);
    if (skill) return skill;
  }

  const soulMd = join(cwd, ".agent", "SOUL.md");
  if (existsSync(soulMd)) {
    const skill = await loadSkillFromFile(soulMd);
    if (skill) return skill;
  }

  // 3. Default
  return builtinSkills.code;
}

export function setActiveSkill(name: string): Skill | undefined {
  if (builtinSkills[name]) {
    process.env.SIMPLE_CLI_SKILL = name;
    return builtinSkills[name];
  }
  return undefined;
}

export function listSkills(): Skill[] {
  return Object.values(builtinSkills);
}

export async function loadCustomSkills(
  dir: string,
): Promise<Record<string, Skill>> {
  const skills: Record<string, Skill> = {};
  if (!existsSync(dir)) return skills;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const path = join(dir, entry.name);
        const skill = await loadSkillFromFile(path);
        if (skill) {
          skills[skill.name] = skill;
        }
      }
    }
  } catch {}
  return skills;
}

export function buildSkillPrompt(skill: Skill, context?: any): string {
  let prompt = skill.systemPrompt;
  if (context?.repoMap) {
    prompt += `\n\n## Repository Structure\n${context.repoMap}`;
  }
  if (context?.files && context.files.length > 0) {
    prompt += `\n\n## Active Files\n${context.files.join("\n")}`;
  }
  return prompt;
}

export async function saveSkillToFile(
  skill: Skill,
  path: string,
): Promise<void> {
  await writeFile(path, JSON.stringify(skill, null, 2));
}
