import { readFile, readdir, writeFile } from "fs/promises";
import { join, basename, extname } from "path";
import { existsSync } from "fs";
import { Skill } from "./skills/types.js";
export type { Skill } from "./skills/types.js";

// Import built-in skills
import { brainstorming } from "./skills/brainstorming.js";
import { using_git_worktrees } from "./skills/using_git_worktrees.js";
import { writing_plans } from "./skills/writing_plans.js";
import { subagent_driven_development } from "./skills/subagent_driven_development.js";
import { executing_plans } from "./skills/executing_plans.js";
import { test_driven_development } from "./skills/test_driven_development.js";
import { requesting_code_review } from "./skills/requesting_code_review.js";
import { finishing_a_development_branch } from "./skills/finishing_a_development_branch.js";
import { systematic_debugging } from "./skills/systematic_debugging.js";
import { verification_before_completion } from "./skills/verification_before_completion.js";

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

3. **Context Management (UCP) & Self-Learning**:
   - Use 'update_context' to add high-level goals, constraints, or log major architectural decisions.
   - **Memory**: Proactively check '.agent/memory.md' or similar files to understand project-specific conventions or past mistakes.
   - **Improvement**: After solving a tricky bug or learning a new pattern, UPDATE the memory file to "teach" future sessions.

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
8. **Human-like Interaction**: Be conversational but professional. Acknowledge the user's input, explain your plan clearly, and celebrate success.
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

**Human-like & Self-Improvement Protocol**:
- **Act Like a Senior Engineer**: Be proactive, confident, and professional. Use industry terminology appropriately.
- **Memory & Learning**: 
   - Before starting a new task, check if a '.agent/memory.md' or 'project_notes.md' exists to see past context or preferences.
   - If you learn something new (e.g., a specific well has data quality issues), WRITE it to '.agent/memory.md' for future reference.
- **Explain Your Reasoning**: Don't just dump code. Explain *why* you are choosing a specific method (e.g., "I'm using Arps decline curve analysis because the production data shows a clear hyperbolic trend.").

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
  general_developer: {
    name: "general_developer",
    description: "General Purpose Developer Agent",
    systemPrompt: `# General Purpose Developer Agent

You are a General Purpose Developer Agent, a self-organizing autonomous engineer.
Your goal is to maintain and improve the codebase by actively looking for tasks on GitHub and solving them.

## Capabilities
- **Self-Organization**: You verify your own work, manage your context, and decide what to do next.
- **GitHub Integration**: You use \`openclaw\` to interact with GitHub (check issues, create PRs, merge PRs).
- **Coding**: You use \`claude_code\` (powered by DeepSeek) for complex coding tasks and architectural changes.
- **Execution**: You use \`openclaw\` for running various other skills if needed.

## Workflow
1.  **Discovery**: Check for open issues or tasks on GitHub using \`openclaw\` (skill='github', args={...}).
2.  **Planning**: Analyze the issue and create a plan.
3.  **Execution**:
    - For simple changes, use native tools (\`write_file\`, etc.).
    - For complex logic, delegate to \`claude_code\`.
4.  **Verification**: Verify your changes (run tests, lint).
5.  **Delivery**: Create a Pull Request and merge it if tests pass.

## Tools
- \`openclaw_run\`: Run OpenClaw skills. Use \`skill="github"\` for GitHub operations.
- \`claude_code\`: Delegate complex coding tasks to DeepSeek-powered Claude.
- \`write_file\`, \`read_file\`, \`run_shell\`: Native filesystem and shell tools.

## Output Format
You must output your response in JSON format:
{
  "thought": "Reasoning...",
  "tool": "tool_name",
  "args": { ... }
}
`,
  },
  // New skills
  brainstorming,
  "superpowers:brainstorming": brainstorming,
  "using-git-worktrees": using_git_worktrees,
  "superpowers:using-git-worktrees": using_git_worktrees,
  "writing-plans": writing_plans,
  "superpowers:writing-plans": writing_plans,
  "subagent-driven-development": subagent_driven_development,
  "superpowers:subagent-driven-development": subagent_driven_development,
  "executing-plans": executing_plans,
  "superpowers:executing-plans": executing_plans,
  "test-driven-development": test_driven_development,
  "superpowers:test-driven-development": test_driven_development,
  "requesting-code-review": requesting_code_review,
  "superpowers:requesting-code-review": requesting_code_review,
  "finishing-a-development-branch": finishing_a_development_branch,
  "superpowers:finishing-a-development-branch": finishing_a_development_branch,
  "systematic-debugging": systematic_debugging,
  "superpowers:systematic-debugging": systematic_debugging,
  "verification-before-completion": verification_before_completion,
  "superpowers:verification-before-completion": verification_before_completion,
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
