# Phase 33: Multi-Agency Ecosystem Showcase

This directory contains the production-ready demonstration of the Simple-CLI root agency orchestrating multiple specialized child agencies to autonomously execute a complex project.

## Overview
The demo showcases the `agency_orchestrator` capabilities by coordinating the completion of an "AI-Powered Metrics Dashboard", which involves three distinct domains:

- **Frontend**: Vue 3 + Tailwind CSS (`agency_frontend`)
- **Backend**: Node.js + Express (`agency_backend`)
- **DevOps**: Docker + GitHub Actions (`agency_devops`)

## Components

1. **`showcase_config.json`**: Defines the child agencies to be spawned, including their IDs, niches, budgets, and capabilities.
2. **`complex_project_spec.json`**: The detailed, realistic JSON project specification with tasks and dependencies spanning all three domains.
3. **`orchestrate.ts`**: A Node.js orchestration script that acts as the "Meta-Orchestrator". It:
   - Reads the project specification.
   - Parses the tasks and dependencies.
   - Triggers the spawning and assignment of the child agencies based on configuration.
   - Monitors execution state, resolves inter-agency dependencies.
   - Handles simulated failure recovery (e.g., token budget exceeded).
   - Generates the final project dashboard report.

## How to Run

To run the orchestration script locally (this acts as a comprehensive integration walkthrough and will output state changes to the console):

```bash
npx tsx demos/agency_ecosystem_showcase/orchestrate.ts
```

> **Note**: Execution requires a valid `OPENAI_API_KEY` or other supported LLM API key configured in your environment, as it utilizes the `EpisodicMemory` embedding functionality.
