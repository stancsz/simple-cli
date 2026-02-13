# Simple-CLI Live Test Suite

This directory contains live test specifications for validating the capabilities of the Simple-CLI agent and its sub-agents. These tests are designed to be executed manually or by an automated UI test runner.

## Structure

- `live/product-director/`: Tests specific to the Product Director example.
  - `market-research/`: Validates the "Market Researcher" agent.
  - `ux-wireframes/`: Validates the "UX Designer" agent.
  - `full-product-loop/`: End-to-end validation of the product development lifecycle.

## Running Tests

Each test case is defined in a `test_specs.md` file within its respective directory.
Follow the "Test Steps" in each file to execute the test.
Verify the "Success Criteria" manually or via scripts.

## Contribution

To add a new test case:

1. Create a new directory under `live/<category>/<test-name>`.
2. Add a `test_specs.md` following the existing format.
