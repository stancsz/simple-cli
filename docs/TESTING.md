# Testing Strategy

For detailed integration testing strategy, see [TESTING_STRATEGY.md](./TESTING_STRATEGY.md).

## End-to-End Testing

### Digital Co-worker Full Stack Validation

The end-to-end test suite (`tests/e2e/digital-coworker.test.ts`) validates the entire lifecycle of the Digital Co-worker:

1.  **Slack Integration:** Simulates user requests via Slack webhook events.
2.  **Job Delegation:** Verifies the agent delegates tasks using the `delegate_task` tool.
3.  **Task Execution & Memory:** Simulates task execution and confirms experience logs are stored in the Brain (LanceDB).
4.  **Cross-Interface Retrieval:** Simulates a user query via MS Teams and verifies the agent retrieves the stored memory to answer correctly.
5.  **Persona Injection:** Ensures the final response is delivered through the appropriate interface adapter.

This test mocks:
-   `src/llm.ts`: Deterministic conversation flow.
-   `src/mcp.ts`: Shared Brain instance and tool execution.
-   `@slack/bolt` & `botbuilder`: Webhook and message handling.

Run the test:
```bash
npx vitest run tests/e2e/digital-coworker.test.ts
```
