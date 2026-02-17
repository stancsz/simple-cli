# SOP Format Definition

The SOP (Standard Operating Procedure) executor parses markdown files to autonomously execute tasks.

## Structure

Each SOP file should be a valid Markdown file (`.md`) placed in the `.agent/sops/` directory.

### Format

```markdown
## Goal
A clear, concise statement of what this SOP achieves.

## Prerequisites
- List of tools or conditions required (optional).
- Example: `docker`, `git`, `npm`

## Steps
1. First step instruction.
2. Second step instruction.
3. Third step instruction.
```

### Instructions

Each step in the `## Steps` section must be a numbered list item. The content should be a natural language instruction that an AI agent can understand and execute using available tools.

Examples:
- "Check out the `main` branch and pull latest changes."
- "Run `npm install` to install dependencies."
- "Research the top 3 competitors for 'AI Coding Agents' and save the list to `competitors.md`."
- "Create a new file `src/utils.ts` with a helper function to validate email addresses."

### Best Practices

1. **Atomic Steps**: Keep each step focused on a single action or a small group of related actions.
2. **Clear Context**: Mention specific file paths, variable names, or URLs if known.
3. **Idempotency**: Write steps that can be safely re-run if the process is interrupted (e.g., "Ensure file exists" rather than "Create file").
