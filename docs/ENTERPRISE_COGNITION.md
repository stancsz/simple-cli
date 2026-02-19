# Enterprise Cognition (The Brain)

## Overview
Enterprise Cognition transforms the agent from a stateless tool into a **learning organization**. By persisting memories of every interaction, successful merge, and failed build, the system enables agents to avoid repeating mistakes and continuously improve their performance.

## Architecture
The Brain consists of two primary memory systems:
1.  **Episodic Memory (Vector DB):** Stores detailed logs of task executions (User Request -> Agent Response -> Outcome). Powered by LanceDB.
2.  **Semantic Memory (Graph):** Stores relationships between concepts, files, and people.

## Active Recall for Autonomous Agents
Autonomous agents (Job Delegator, Reviewer) do not just write to the Brain; they **actively recall** past experiences before making decisions.

### Pattern: The Learning Loop
1.  **Pre-Execution Recall:** Before generating a task list or reviewing code, the agent queries the Brain for relevant "lessons learned" (e.g., "common deployment failures", "code review preferences").
2.  **Context Injection:** These insights are injected into the agent's system prompt or task definition.
    *   *Example:* "Note: Last time you ran tests on Monday, it failed due to missing env vars. Ensure they are set."
3.  **Execution & Logging:** The agent performs the task, and the outcome (success/failure, summary) is logged back to the Brain.

### Implementation
*   **Job Delegator (`src/scheduler/job_delegator.ts`):** Queries `brain_query` with the task name to find past pitfalls. Modifies the task prompt to include these warnings.
*   **Hourly Reviewer (`src/mcp_servers/reviewer/index.ts`):** Queries `brain_query` for "code review preferences" and "common bugs". Passes these insights to the `ReviewerAgent` to tailor the feedback (e.g., focusing on security if previously requested).

## Usage
The Brain is exposed via the `brain` MCP server.
*   `brain_store`: Save a memory.
*   `brain_query`: Search for memories.
*   `log_experience`: Log a structured task outcome.

## Future Work
*   **Cross-Project Learning:** Allow agents to apply lessons from Project A to Project B.
*   **User Preference Learning:** Automatically deduce and store user preferences (e.g., "User prefers concise logs").
