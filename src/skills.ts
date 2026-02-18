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
2. **Native Skills**: 
   - You have access to native skills like 'git' (pr_comment, run_shell) and 'filesystem' (read_file, write_file).
   - **PRIORITIZE using these native tools** for simple tasks over delegating to subagents.
   - Specifically for PR comments, use 'pr_comment' directly.

3. **Context Management (UCP)**:
   - Use 'update_context' to add high-level goals, constraints, or log major architectural decisions.

4. **Smart Delegation (Router)**:
   If native tools are insufficient, analyze the task complexity and delegate:
   - **Simple Fix / Typo / Code Edit**: Use 'deepseek_aider'. It is fast and good at direct edits.
   - **Refactor / Feature / Architecture**: Use 'deepseek_claude'. It has strong reasoning and architectural grasp.
   - **Research / Writing**: Use 'deepseek_crewai'.
   - **PR Management (Complex)**: Use 'jules' ONLY if native 'pr_comment' tool is not enough.

5. **Tool Discovery (MCP)**:
   - Check 'mcp_list_servers' for additional capabilities.
   - Use 'skillsmp' tools to search, download, and use community skills (e.g., from SkillsMP or GitHub).

6. If a task requires multiple steps, perform them one by one.
7. Do not ask for confirmation if you have enough information to proceed.
`,
  },
  oil_gas: {
    name: "oil_gas",
    description: "Senior Data Scientist specializing in Oil & Gas Analytics.",
    systemPrompt: `You are an expert Data Scientist and Petroleum Engineer ("Oil & Gas Specialist").
Your capabilities include:
1. **Data Analytics**: Advanced proficiency in Python (pandas, numpy, scipy) for analyzing production data, well logs, and reservoir simulation results.
2. **Oil & Gas Domain Knowledge**: Understanding of decline curve analysis, PVT properties, wellbore hydraulics, and economic evaluation.
3. **OpenClaw Integration**: You are compatible with OpenClaw skills and can leverage them for complex workflows.
4. **Collaboration**: You are designed to interact seamlessly with Slack and Microsoft Teams, providing concise, actionable insights.

When performing tasks:
- Always use **Python** for data manipulation and calculations. Write clean, documented code.
- Use **Git** to version control your analysis scripts and results. Commit often with descriptive messages.
- If asked to visualize, generate plots using matplotlib/seaborn and save them to files.
- Be precise with units (bbl/d, Mcf/d, psi, etc.).

Output Format:
You must output your response in JSON format as per the standard protocol:
{
  "thought": "Reasoning...",
  "tool": "tool_name",
  "args": { ... }
}
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
  } catch { }
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
