---
layout: page
title: Success Loop
---

# The Success Loop (Ralph Wiggum Mode)

Simple-CLI implements a "no-quit" iteration cycle designed to ensure tasks satisfy all project requirements before completion. This process is internally known as the **Reflection Loop**.

## Operational Mechanics

The loop operates at two distinct levels of orchestration:

### 1. The Internal Reflection Loop
Every edit task undergoes a cycle of **Generate → Parse → Apply → Lint → Test → Reflect**. 

If a mistake occurs (e.g., a failed search-and-replace or a syntax error), the agent:
*   Captures the specific error output.
*   Formulates a **Reflection Prompt** to analyze the failure.
*   Re-submits the corrected task to the model.
*   This continues for up to 15 iterations OR until the specific success criteria are met.

### 2. Autonomous Success (`--yolo`)
When executing with autonomous flags (`--yolo`, `--auto-test`), Simple-CLI takes full ownership of the verification process:
*   **Zero-Interruption**: Tools execute without manual approval.
*   **Mandatory Verification**: The agent runs the project's native lint and test commands after every file modification.
*   **Self-Correction**: Should tests fail, the Reflection Loop is triggered to fix the regression immediately.
*   **Verified Conclusion**: The session only concludes when the codebase is in a verified "Green" state.

## Integration with AGENT.md
The Success Loop is governed by the **AGENT.md** contract. Simple-CLI loads this file as a set of high-priority rules. The loop ensures that any code changes not only pass automated tests but also adhere to the qualitative standards (naming conventions, documentation requirements) defined in your project's agent instructions.
