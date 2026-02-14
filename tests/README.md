# Simple-CLI Test Suite

This directory contains the automated and live test suites for the Simple-CLI project.

## Directory Structure

- `e2e/`: End-to-end integration tests.
- `fixtures/`: Test data and mock files.
- `live/`: Live tests that require network access or system interaction.
  - `product-director/`: Scenario-based tests for the Product Director agent.
- `tools/`: Unit tests for specific tools.
- `mcp/`: Tests for the Model Context Protocol implementation.
- `manual_scripts/`: Scripts for manual validation.

## Running Tests

### Automated Tests

Run all unit and integration tests using `npm test` or `vitest`.

### Live Specifications

The `live/` directory contains `test_specs.md` files describing scenario-based tests.
These are currently manual or semi-automated specifications.

Example:

- View `tests/live/product-director/market-research/test_specs.md` for the Market Research agent test plan.
