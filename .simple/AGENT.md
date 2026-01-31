# 🌊 AGENT.md: Project Rules & Evolution

This project operates on **Vibe Coding** principles: priority is given to rapid iteration, intuitive feedback loops, and high-level goal alignment.

---

## 🎯 Success Criteria
- **Functional Completeness**: The requested feature must be fully operational and verified by tests.
- **Architectural Harmony**: Code must follow the "Thin Core" and "Modular Skills" philosophy.
- **Self-Documentation**: All new features and tools must have accompanying documentation.

## 🚀 Operational Rules
- **Autonomy**: Use `--yolo` mode for repetitive tasks and small fixes.
- **Persistence**: If a test fails, do not quit. Analyze the error and enter the **Reflection Loop** until it passes.
- **Context Management**: Keep active files minimal. Close files once they are no longer being modified.
- **Momentum Principle**: Fail fast. Don't spend 20 turns planning. Try a small implementation, check the result, and pivot if needed.
- **Incremental Commits**: Commit early and often.

## 🧪 Testing Protocol
- All edits must be followed by a `lint` and `test` check.
- If no tests exist for a feature, **create them** before declaring the task finished.
- **No-Quit Loop**: If tests fail, analyze the error, hypothesize a fix, and apply it. Only escalate if fundamentally blocked.

---

## 🧬 Evolution Guidelines
Simple-CLI is designed to grow. As an agent, follow these SOPs for self-expansion:

1.  **Capability Gap Analysis**: Before every complex task, ask: *"Do I have the tools required to do this efficiently?"* If not, create a **Script** or **Skill**.
2.  **The Self-Evolution Loop**:
    - **Draft**: Write logic in `skills/` or `scripts/`.
    - **Verify**: Run a small test case.
    - **Document**: Create an eponymous `.md` file with `# toolName`, `## Command`, and `## Parameters`.
    - **Sync**: Call `reloadTools` (if available) to register the capability.
3.  **Maintenance**: Periodically review `skills/`, consolidate overlapping scripts, and delete obsolete ones.

---

## 🛠️ Tool Creation Standards
To ensure tools are reliable and discoverable:

1.  **Interface Design**:
    - **Communication**: Always use JSON over **stdin** for inputs and **stdout** for outputs.
    - **Environment**: Use `TOOL_INPUT` environment variable as a secondary input method.
    - **Statelessness**: Tools should be as deterministic and side-effect-free as possible.
2.  **Documentation & Attribution**:
    - **Marker**: The first line of BOTH script and MD file MUST be `[Simple-CLI AI-Created]`.
    - **Naming**: Use camelCase for `# toolName`.
    - **Description**: Focus on the **Strategy**—explain NOT just what it does, but **when** to choose it.
3.  **Language Selection**:
    - **Python**: Preferred for data processing, scraping, and logic-heavy tasks.
    - **Bash/SH**: Preferred for simple file system orchestration.
    - **TypeScript**: Preferred for integration with core native libraries.

---

## 🎭 Custom Prompts & Persona Enhancement
You can enhance default behavior by adding specific instructions here.

### Project Persona
*(Define high-level project goals or engineering personas here)*

### Domain Language
*(Specify project-specific terminology)*

---
**Note to Agent**: Keep this file surgically precise. Focus on constraints that the base model wouldn't know by default.
