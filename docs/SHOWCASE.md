# Simple CLI Showcase: The Digital Agency Demo

This showcase demonstrates the full 'Digital Agency' capability of Simple CLI by autonomously building, deploying, and managing a simple web application for "Showcase Corp".

## Overview

The showcase simulates a 24-hour cycle of an autonomous software engineering team in just a few minutes. It covers:

1.  **Company Context**: Loading the "Showcase Corp" brand voice, tech stack, and goals.
2.  **SOP-as-Code**: Executing a predefined Standard Operating Procedure (SOP) to build a TODO app.
3.  **Ghost Mode**: Running autonomous "Morning Standups" to check status.
4.  **HR Loop**: Performing a "Daily HR Review" to analyze logs and propose improvements.

## Directory Structure

The showcase is located in `demos/simple-cli-showcase/` and contains:
-   `company_context.json`: Defines the client profile.
-   `docs/showcase_sop.md`: The step-by-step guide for the agent.
-   `scheduler.json`: Configuration for autonomous tasks.
-   `run_demo.sh`: The script to launch the simulation.

## Running the Demo

To run the showcase simulation:

1.  Ensure you have `bun` installed (or use `ts-node` if configured).
2.  Navigate to the repository root.
3.  Run the demo script:

```bash
./demos/simple-cli-showcase/run_demo.sh
```

## Interpreting Results

The script will output logs for each stage:

-   **Step 1: Initializing MCP**: Starts the necessary MCP servers (Company, SOP, Brain, etc.).
-   **Pillar 1: Company Context**: Loads and queries the Showcase Corp context.
-   **Pillar 2: SOP-as-Code**: Executes the project initialization and deployment SOP.
-   **Pillar 3: Ghost Mode**: Simulates a "Morning Standup" at 9:00 AM.
-   **Pillar 4: HR Loop**: Simulates a "Daily HR Review" at 6:00 PM, analyzing the day's logs.

Artifacts (logs, simulated code) will be generated in `demos/simple-cli-showcase/` and `.agent/`.

## Validation

This showcase is validated by an integration test: `tests/integration/showcase_simulation.test.ts`.
You can run the test with:

```bash
npm test tests/integration/showcase_simulation.test.ts
```
