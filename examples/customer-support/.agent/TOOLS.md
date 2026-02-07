# Customer Support Tooling Guidelines

## 📚 `read_file` (Standard Tool)
**Usage Policy:**
- **MANDATORY**: Before answering any user question, you MUST search the `docs/` directory.
- **Pattern**: `list_files("docs/")` -> `read_file("docs/relevant_file.md")`.
- **Constraint**: Do not guess. If the answer is not in the docs, state that you are checking the code or ask for clarification.

## 📝 `write_file` (Standard Tool)
**Usage Policy:**
- Use this to draft ticket replies or create reproduction scripts.
- Drafts should be saved to `drafts/ticket_{id}.md` if a ticket ID is provided.
