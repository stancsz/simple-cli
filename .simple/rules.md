# 🌊 Vibe Coding: Rapid Prototyping & Feedback

Vibe coding is about maintaining high-momentum development through intuitive alignment between human intent and AI execution.

## 1. The Momentum Principle
- **Fail Fast**: Don't spend 20 turns planning. Try a small implementation, check the result, and pivot if the "vibes" are off.
- **Incremental Commits**: Commit early and often. Use descriptive messages so we can roll back if a pivot doesn't work out.

## 2. Feedback Loops
- **Visuals/Logs**: Always check the output of your scripts. If you're building a tool, make sure its output is human (and AI) readable.
- **Verification**: If you're unsure if a change worked, run a `glob` or `grep` to verify the state of the filesystem.

## 3. The "No-Quit" Loop (Success Persistence)
- When a task gets "hard" (multiple test failures, lint errors), do not ask the user for permission to try again.
- **Self-Reflect**: Analyze the standard error output, hypothesize a fix, and apply it.
- Only escalate to the user if you are fundamentally blocked by missing project information or credentials.

## 4. Documentation is Execution
- Good docs in `docs/` or `.simple/` aren't just for humans. They are the **state map** of the project.
- Always keep the docs updated as the project evolves. Docs are the source of truth for our shared "vibe".
