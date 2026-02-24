# Core Update Protocol Specification

## Overview
The **Core Update MCP Server** enables the Digital Biosphere to recursively improve itself by modifying its own source code (e.g., `src/engine.ts`, `src/builtins.ts`). This capability is protected by a strict **Dual-Verification Safety Protocol** to prevent regression, malicious code injection, or accidental instability.

## Architecture

### Tools
1.  **`analyze_code_smell(filePath)`**:
    *   Uses an expert "Software Architect" persona to identify performance bottlenecks, bugs, and architectural debt.
    *   Returns structured analysis (issues, severity, recommendations).

2.  **`propose_core_update(filePath, improvementDescription)`**:
    *   Uses a "Senior Engineer" persona to generate a specific patch (diff) to address the identified issues.
    *   Generates a rationale and a test plan.

3.  **`apply_core_update(filePath, diff, summary, yoloMode)`**:
    *   The critical effector tool.
    *   Enforces the Safety Protocol.
    *   Creates timestamped backups in `.agent/backups/`.
    *   Logs all actions to the Episodic Memory (Brain).

## Safety Protocol

The `apply_core_update` tool enforces the following checks **before** any file is written:

### 1. Path Validation
*   Target file must exist within the project root (`process.cwd()`).
*   Target file must have an allowed extension (`.ts`, `.js`, `.json`, `.md`).
*   Path traversal (`..`) is strictly forbidden.

### 2. Supervisor Agent Verification (Machine Check)
*   A separate, isolated LLM call is made to a "Strict Code Supervisor" persona.
*   The Supervisor reviews the diff for:
    *   Security vulnerabilities.
    *   Correctness and logic errors.
    *   Architectural compliance.
*   If the Supervisor rejects the change, the operation is **aborted immediately**.

### 3. Human Approval (Human-in-the-Loop)
*   Unless `yoloMode` is set to `true`, the system requires human confirmation.
*   In interactive modes, the user is prompted to approve the risk level and summary.
*   If the user rejects or the request times out (configurable via `autoDecisionTimeout`), the update is aborted.
*   *Note: In automated environments, this can be configured to default to approval or strict rejection.*

### 4. Backup & Rollback
*   Before modification, the original file is copied to `.agent/backups/<filename>_<timestamp>.bak`.
*   This ensures that any "lobotomy" or breaking change can be manually reverted by restoring the backup.

## Usage Example

```typescript
// 1. Analyze
use_mcp_tool("core_update", "analyze_code_smell", { filePath: "src/engine.ts" });

// 2. Propose
use_mcp_tool("core_update", "propose_core_update", {
  filePath: "src/engine.ts",
  improvementDescription: "Optimize the main loop to reduce CPU usage by caching context."
});

// 3. Apply
use_mcp_tool("core_update", "apply_core_update", {
  filePath: "src/engine.ts",
  diff: "...",
  summary: "Optimization of main loop context caching",
  yoloMode: false
});
```
