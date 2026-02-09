# Research: Meta-Orchestrator Concurrency & Conflict Resolution

## 1. Executive Summary
Current state of `simple-cli` uses a **Global Lock** (Synchronous Delegation), ensuring safety but severely limiting throughput. Industry-leading autonomous software engineers (e.g., Devin, AutoDev, OpenDevin) solve this not by stricter locking, but by **isolation** and **standard distributed system patterns** (Git branching, sandboxing, and optimistic concurrency).

The user's hypothesis of *"assigning work that touch different folders/paths"* is a valid strategy (Path-Based Locking) but is often a stepping stone to the more robust **Branch-Based Isolation** model.

## 2. Industry Leading Approaches

### A. Sandboxed Isolation & Git Workflows (The "Devin" Model)
Top-tier agents do not work on the same live filesystem. Instead:
1.  **Workspace Cloning**: Each active agent gets a clone of the repo or a sandboxed environment (Docker container).
2.  **Feature Branching**: Every delegated task spawns a new Git branch (e.g., `feat/auth-update-agent-1`).
3.  **Parallel Execution**: Agents run 100% asynchronously. They edit files, run tests, and potentially break things *in their own branch*.
4.  **Merge & Conflict Resolution**:
    *   When a task is done, the agent opens a Pull Request.
    *   If merge conflicts occur, a specialized "Merge Specialist" agent is spawned to resolve them (using AI to understand both changes).
    *   CI/CD pipelines run on the branch before merging.

**Why this works:** It removes the need for locks entirely. Conflict resolution is deferred until the *merge* step, which is standard software engineering practice.

### B. Hierarchical "Architect" Sharding
Projects like **MetaGPT** and **ChatDev** use a strict waterfall or hierarchical structure:
1.  **Architect Agent**: Analyzes the request and breaks it into non-overlapping components (e.g., "Agent A takes `/backend`, Agent B takes `/frontend`").
2.  **Strict Boundaries**: Agents are prompted with instructions *only* to touch their assigned directories.
3.  **Integration Phase**: A separate phase where an "Integrator" agent stitches components together.

**Why this works:** It prevents conflicts by design (planning phase), rather than by technical enforcement.

### C. Optimistic Concurrency Control (OCC)
Used in real-time collaborative editors and some experimental agent frameworks:
*   Agents read the latest state.
*   Agents compute edits.
*   Before applying edits, the system checks if the file has changed since the read.
*   If changed -> **Retry/Rebase** (Agent is told "File changed, please re-apply your logic to the new content").
*   If not changed -> **Apply**.

## 3. Analysis of User's Proposal: Path-Based Locking

The idea of *"assigning work that touch different folders, paths"* is effectively a **Granular Locking** strategy.

### Concept produces:
*   **The "Orchestrator"** maintains a `LockTable` (e.g., in memory or a simple `.lock` file) mapping paths to active Agent IDs.
    *   `src/auth/*` -> LOCKED by Agent A
    *   `src/ui/*` -> LOCKED by Agent B
*   **Delegation Check**: When delegating, the Orchestrator checks if the requested scope overlaps with any active locks.
    *   If yes -> Queue task / Wait.
    *   If no -> Delegate immediately (Async).

### Pros:
*   **Higher Throughput**: Tasks on disparate parts of the codebase run in parallel.
*   **Simplicity**: specialized logic compared to managing full git worktrees/branches.
*   **Safety**: Prevents direct file corruption.

### Cons:
*   **Cross-Cutting Concerns**: What if Agent A needs to import a function from `src/utils` that Agent B is refactoring?
*   **Deadlocks**: Agent A locks `Folder X` and needs `Folder Y`. Agent B locks `Folder Y` and needs `Folder X`.

## 4. Recommendations for Simple-CLI

Given the current architecture, we recommend a phased approach:

### Phase 1: Context-Aware Path Sharding (The "Traffic Cop")
Instead of a hard technical lock, update the **System Prompt** of the Meta-Orchestrator to perform "Smart Sharding":
1.  Analyze the TODO list.
2.  Group tasks by their likely file impact (e.g., "Docs tasks", "Src/Agent tasks", "Test tasks").
3.  Dispatch strictly non-overlapping groups in parallel.
4.  Keep overlapping tasks serial.

**Implementation**:
*   Modify `delegate_cli` to accept a `scope` parameter (e.g., `scope=["src/agents"]`).
*   Orchestrator tracks "Active Scopes".

### Phase 2: Git Worktree Isolation (The "Pro" Move)
Use `git worktree` to allow agents to run in parallel folders on the *same machine* without full containerization overhead.
1.  Check out active branch to `temp/agent-A-worktree`.
2.  Check out active branch to `temp/agent-B-worktree`.
3.  Agents work freely.
4.  Agent commits changes.
5.  Orchestrator tries to merge.

## Summary Table

| Feature | Global Lock (Current) | Path Sharding (Proposed) | Branch Isolation (Industry Leader) |
| :--- | :--- | :--- | :--- |
| **Throughput** | Low (Serial) | Medium (Parallel disjoint) | High (Parallel all) |
| **Complexity** | Low | Medium | High (Merge conflicts) |
| **Safety** | High | Medium (Imports issues) | High (Isolated) |
| **Agent Autonomy** | Low | Medium | High |

