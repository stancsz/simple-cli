# Recursive Optimization: The Core Update Protocol

Simple-CLI implements a powerful "Self-Repair" and "Recursive Evolution" capability, allowing the agent to propose and apply improvements to its own source code. This process is governed by strict safety protocols to prevent accidental breakage or malicious modifications.

## The Core Update Architecture

The Recursive Optimization pillar consists of three main components:

1.  **HR Loop (`src/mcp_servers/hr/`)**:
    *   Continuously analyzes execution logs (`.agent/brain/sop_logs.json`).
    *   Identifies patterns of failure or inefficiency.
    *   Generates *Proposals* for improvement.
    *   If the improvement requires modifying `src/` files, it delegates to the **Core Update MCP**.

2.  **Core Update MCP (`src/mcp_servers/core_updater/`)**:
    *   **Secure Gateway**: The only authorized mechanism to modify `src/` files.
    *   **Patch-Based**: Changes are submitted as standard unified diffs (patches), allowing precise and reversible modifications.
    *   **Dual-Verification**: Requires human approval (via token) or strict "YOLO Mode" constraints.

3.  **The Brain (`src/mcp_servers/brain/`)**:
    *   Stores history of past updates and their outcomes.
    *   Used during risk analysis to detect if a file has a history of causing regressions.

## The Workflow

### 1. Analysis & Proposal
The **HR Loop** (or a human via CLI) identifies a necessary change. It generates a patch file and calls:
`propose_core_update(analysis, change_summary, patch_file_path)`

*   **Validation**: The server validates the patch file exists and *only* affects files within `src/`.
*   **Risk Analysis**:
    *   **Critical**: Modifications to `src/engine.ts`, `src/builtins.ts`, or `src/cli.ts`.
    *   **High**: Modifications to files with a history of failures (queried from Brain).
    *   **Low**: Standard modifications.
*   **Output**: Returns a `proposal_id` and an `approval_token`.

### 2. Review & Approval
The user (or Supervisor Agent) reviews the proposal.
*   **Standard Mode**: Requires the `approval_token` to apply.
*   **YOLO Mode** (`yoloMode: true` in config):
    *   **Low Risk**: applied automatically without token.
    *   **High/Critical Risk**: STILL requires `approval_token`.

### 3. Application
To apply the change, the agent calls:
`apply_core_update(proposal_id, approval_token)`

*   **Backup**: The server creates a backup of all affected files in `.agent/backups/{uuid}/`.
*   **Patching**: Uses `diff` library to apply the patch safely.
*   **Verification**: If patching fails (e.g., hunk mismatch), the operation aborts, and files are restored (or left untouched if atomic).
*   **Logging**: The outcome is logged to the Brain for future reference.

## Safety Gates

| Risk Level | Description | Standard Mode | YOLO Mode |
| :--- | :--- | :--- | :--- |
| **Low** | Routine changes to non-critical files. | Token Required | **Auto-Apply** |
| **High** | Files with history of bugs/regressions. | Token Required | Token Required |
| **Critical** | `engine.ts`, `builtins.ts`, `cli.ts`. | Token Required | Token Required |

## Integration with HR Loop

When the HR Loop detects a need for a core update, it outputs a structured response:
```json
{
  "improvement_needed": true,
  "affected_files": ["src/some_file.ts"],
  "patch": "...",
  "analysis": "..."
}
```
The agent then:
1.  Saves the patch to a temporary file.
2.  Calls `propose_core_update`.
3.  Presents the `proposal_id` and `approval_token` to the user for confirmation (or auto-applies if YOLO).
