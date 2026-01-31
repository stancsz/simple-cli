# 🎭 Custom Prompts & Persona Enhancement

You can enhance Simple-CLI's default system behavior by adding project-specific prompts to the `.simple/` or `.agent/` directories.

## 🚀 How to Enhance Defaults
Simple-CLI automatically injects the contents of certain markdown files into the system prompt at startup.

1.  **Orchestration Prompts**: Use `prompts.md` to define high-level project goals or personas (e.g., "Act as a Senior DevOps Engineer").
2.  **Specific Rules**: Use `rules.md` or `AGENT.md` for strict constraints and quality standards.

### Example Prompt Injection (`.simple/prompts.md`):
```markdown
## Project Persona
You are an expert in high-performance distributed systems. Prioritize:
- Lock-free data structures.
- Minimal memory allocations.
- Clear error propagation patterns.

## Domain Language
When discussing networking, use terms like "Backpressure," "Head-of-Line Blocking," and "Zero-copy."
```

---

## ⚠️ Important: Context Management
While custom prompts are powerful, keep the following side effects in mind when adding large files to your orchestration folders:

*   **Context Pressure**: Every line in these files uses tokens from the model's context window.
*   **Reasoning Quality**: Overloading the prompt with too many "soft" instructions can cause the model to lose track of actual code details or conflict with built-in tool logic.
*   **Cost**: Larger system prompts increase the cost per turn.

**Recommendation**: Keep your prompts surgically precise. Focus on project-specific constraints that the base model wouldn't know by default.
