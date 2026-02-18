# HR Loop (Recursive Self-Optimization)

The HR Loop is a background system that enables the agent workforce to self-optimize by analyzing failure patterns and proposing improvements to agent "souls" (`AGENT.md` files).

## Architecture

The system consists of three main components:
1.  **Job Delegator**: Logs all agent task executions to `.agent/ghost_logs/`.
2.  **Scheduler**: Triggers a "Daily HR Review" task at 03:00 UTC.
3.  **HR MCP Server**: Provides tools for analysis and improvement.

## HR MCP Tools

### `analyze_agent_logs`
-   **Input**: `agent_name`, `timeframe_hours` (default: 24)
-   **Action**: Scans `.agent/ghost_logs/` for failed tasks within the timeframe. Groups failures by error message.
-   **Output**: A statistical report of success rate and top failure patterns.

### `suggest_agent_improvement`
-   **Input**: `agent_name`, `title`, `description`, `changes` (markdown content)
-   **Action**: Creates a proposal file in `.agent/hr_proposals/`.
-   **Output**: A Proposal ID.
-   **Safety**: This tool *only* creates a proposal. It does not modify the agent directly.

### `update_agent_soul`
-   **Input**: `proposal_id`
-   **Action**:
    1.  Checks if the proposal exists.
    2.  **Safety Protocol**: Checks if the proposal has been **approved**. (In this Foundation implementation, it checks for a `.approved` marker file. In production, this verifies a GitHub Issue comment).
    3.  If approved, appends the changes to `src/agents/souls/<agent>.md`.
-   **Output**: Success or error message.

## Safety Protocol (Dual-Verification)

To prevent the agent from degrading its own performance or introducing malicious instructions, the HR Loop enforces a strict **Dual-Verification** process:

1.  **Suggestion**: The HR Agent (running autonomously) can *only* call `suggest_agent_improvement`. It cannot call `update_agent_soul` directly without an approval signal.
2.  **Review**: A Human (or a specialized Supervisor Agent) reviews the proposal.
3.  **Approval**: The reviewer signals approval (e.g., by commenting on a GitHub Issue).
4.  **Execution**: The `update_agent_soul` tool is called. It verifies the approval signal before applying changes.

## Workflow

1.  **03:00 UTC**: Scheduler triggers "Daily HR Review".
2.  **Analysis**: The HR Agent calls `analyze_agent_logs("aider")`.
3.  **Reflection**: The HR Agent identifies that "aider" keeps failing when `npm test` times out.
4.  **Proposal**: The HR Agent calls `suggest_agent_improvement` with a new instruction: "Always run tests with a timeout of 60s."
5.  **Review**: A human sees the proposal (e.g., via a generated issue or notification) and approves it.
6.  **Update**: The changes are applied to `src/agents/souls/aider.md`.

## Weekly Review

A more comprehensive review runs weekly at **Sunday midnight (00:00 UTC)**.

-   **Trigger**: `weekly-hr-review` task in Scheduler.
-   **Tool**: `perform_weekly_review`.
-   **Scope**: Analyzes logs and experiences from the past week (larger context window).
-   **Goal**: Identify long-term patterns, systemic inefficiencies, and architectural improvements that daily reviews might miss.
