# Phase 32: Agency Spawning Protocol - Validation Plan

## Objective
Validate the main agency's ability to autonomously spawn new, independent child agencies with their own context, resources, and isolated environments.

## Scope of Testing
The integration tests will cover the following scenarios:

1. **Successful Agency Spawning**
   - Simulate spawning a child agency by invoking a mocked spawning protocol.
   - Verify that the child agency's workspace and environment variables are initialized correctly.

2. **Context Injection**
   - Provide initial context (e.g., target niche, basic instructions) to the child agency during spawn.
   - Ensure the child agency correctly stores and retrieves this context from its isolated Brain (EpisodicMemory).

3. **Independent Operation**
   - Ensure the child agency can execute tasks independently without interfering with the parent agency.
   - Test by running a mock task delegation on the child agency.

4. **Resource Isolation**
   - Confirm that the child agency uses its own memory, ledger, and workspace.
   - Verify that the child's operations do not bleed into the parent agency's state.

5. **Error Handling & Constraints**
   - Simulate insufficient resources or policy constraints during spawning.
   - Validate that the spawning protocol catches constraints and fails gracefully without side effects.

## Methodology
- **Test File:** `tests/integration/phase32_agency_spawning_validation.test.ts`
- **Framework:** Vitest
- **Mocks:** Since PR #664 is not merged, the `spawn_new_agency` functionality will be mocked within the test file, using underlying `fs` operations and the existing Phase 31 Federation tools to simulate child operation.
- **Environment:** Isolated `testAgentDir` to mimic independent setups without affecting real local state.

## Criteria for Success
- All Vitest integration tests pass.
- Child agency operations read from and write to their own distinct paths.
- Graceful error responses are generated when constraints are broken.
