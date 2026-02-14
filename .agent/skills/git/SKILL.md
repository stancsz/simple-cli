
---
name: git
description: Tools for interacting with Git repositories and managing PRs.
---
# Git Automation Skill

This skill provides functionality for:
- Executing shell commands (including git commands).
- Automating Pull Request comments and interactions via GitHub CLI (gh).

### Tools
- **run_shell**: Execute any shell command, including `git status`, `git commit`, `git push`, etc.
- **pr_comment**: Post comments on PRs.

### Example Usage
To create a commit:
1. Use `run_shell` to stage files: `git add .`
2. Use `run_shell` to commit: `git commit -m "feat: new feature"`.

To comment on a PR:
1. Use `pr_comment` with the PR number and message body.
