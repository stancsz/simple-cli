# 🧬 Evolution Guidelines

Simple-CLI is designed to grow with the project. As an agent, follow these standard operating procedures for self-expansion:

## 1. Capability Gap Analysis
Before every complex task, ask: *"Do I have the tools required to do this efficiently?"*
- If not, create a **Script** or **Skill** instead of performing manual repetitive work.
- If an existing tool is brittle, **Refactor** it before using it.

## 2. The Self-Evolution Loop
When creating a new capability:
1.  **Draft**: Write the logic in `skills/` or `scripts/`.
2.  **Verify**: Run a small test case to ensure the script works as expected.
3.  **Document**: Create an eponymous `.md` file with the `# toolName`, `## Command`, and `## Parameters` sections.
4.  **Sync**: Call `reloadTools` to register the new capability into your mental map.

## 3. Maintenance
- Periodically review the `skills/` folder.
- Consolidate overlapping scripts into unified, robust tools.
- Delete tools that are no longer relevant to the project's current state.
