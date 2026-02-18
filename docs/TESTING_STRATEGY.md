# Integration Testing Strategy: The 4-Pillar Vision

This document outlines the strategy for validating the cohesive operation of Simple CLI's core components ("The 4 Pillars"): Company Context, SOP Engine, The Brain, and Recursive Optimization (HR Loop).

## Architecture

The integration tests are located in `tests/integration/` (specifically `four_pillars.test.ts`). They are designed to simulate the full agent lifecycle in a controlled environment.

### Core Components Under Test

1.  **Company Context (The Briefcase)**:
    -   **Fixture**: `tests/fixtures/four_pillars/.agent/companies/company_a/`
    -   **Verification**: Ensures the agent loads `persona.json` and respects brand voice/docs during execution.
    -   **Server**: `src/mcp_servers/company_context.ts`

2.  **SOP Engine (The Operating Manual)**:
    -   **Fixture**: `tests/fixtures/four_pillars/docs/sops/deployment.md`
    -   **Verification**: Executes a multi-step SOP using mocked LLM responses. Validates tool calls (`ls`, `write_file`, `git_commit`) and successful completion.
    -   **Server**: `src/mcp_servers/sop_engine/index.ts`

3.  **The Brain (Enterprise Cognition)**:
    -   **Storage**: Uses a temporary directory for LanceDB and JSON logs (`.agent/brain/`).
    -   **Verification**: Ensures SOP execution logs are written to `sop_logs.json` and are retrievable via `ContextManager` (simulating memory recall).
    -   **Server**: `src/mcp_servers/brain.ts`

4.  **Recursive Optimization (HR Loop)**:
    -   **Mechanism**: Simulates "Ghost Mode" (Weekly Review) by manually triggering the `perform_weekly_review` tool.
    -   **Verification**: Mocks LLM analysis to detect patterns in logs and proposes a change. verifies that a `Proposal` is created in `proposals.json`.
    -   **Server**: `src/mcp_servers/hr/index.ts`

## Mocking Strategy

To ensure reliability and speed, we mock external dependencies while keeping internal logic real.

-   **MCP (Model Context Protocol)**:
    -   We mock the `MCP` class and transport layer.
    -   We instantiate **REAL** MCP servers (`CompanyContextServer`, `SOPEngineServer`, etc.) and register their tools into a shared `registeredTools` map.
    -   The `Engine` or test runner calls these tools directly via the mock, bypassing stdio/network overhead.

-   **LLM (Large Language Model)**:
    -   We mock `src/llm.ts` to use a `MockLLM` class.
    -   **Response Queue**: The test pushes pre-defined responses (thought, tool calls, messages) into a queue. The `MockLLM` consumes them in order.
    -   This allows deterministic testing of multi-step conversations and SOP executions.

-   **Filesystem**:
    -   We use `vi.spyOn(process, "cwd")` to redirect all operations to `tests/fixtures/four_pillars`.
    -   We clean up this directory before/after tests.

## Running Tests

To run the integration suite:

```bash
npm run test:four-pillars
```

Or via Vitest directly:

```bash
npx vitest run tests/integration/four_pillars.test.ts
```

## Future Expansion

-   **Multi-Company Tests**: Add `company_b` to verify isolation.
-   **Failure Scenarios**: Test SOP step failures and retry logic (MockLLM can simulate failures).
-   **Concurrency**: Verify that multiple agents accessing the Brain (via locks) do not corrupt data.
