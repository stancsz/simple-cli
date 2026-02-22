# SOP Engine

The **SOP Engine** is a core component of the Simple CLI agentic framework. It allows the system to autonomously execute Standard Operating Procedures (SOPs) defined in simple Markdown files.

## Overview

The SOP Engine parses Markdown files, extracts steps, and uses an LLM (Large Language Model) to execute each step using available MCP (Model Context Protocol) tools. It includes robust features like:
- **Autonomous Tool Discovery**: Finds and uses tools from any connected MCP server (e.g., Git, Filesystem, Brain).
- **Brain Integration**: Queries the "Brain" for past experiences before execution to learn from previous successes or failures.
- **Experience Logging**: Logs every step and the final outcome to the Brain for future reference.
- **Resilience**: Implements exponential backoff retries for failed steps.

## SOP Format

SOPs are written in standard Markdown. The engine looks for a **Title** (H1) and a **Numbered List** of steps.

### Example SOP (`docs/sops/deploy_production.md`)

```markdown
# Deploy to Production

This SOP handles the deployment process for the main application.

1. **Run Tests**: Execute the test suite to ensure code quality.
2. **Build Docker Image**: Build the Docker image using the `latest` tag.
3. **Push to Registry**: Push the built image to the container registry.
4. **Deploy to Cluster**: Update the Kubernetes deployment with the new image.
5. **Verify Health**: Check the health endpoint to ensure the service is running.
```

### Step Format
- **Numbered List**: Steps must be numbered (e.g., `1.`, `2.`).
- **Step Name**: The bold text at the start of the item is the step name (e.g., `**Run Tests**`).
- **Instruction**: The rest of the text is the instruction for the agent.

## Tools

The SOP Engine exposes the following MCP tools:

### `sop_list`
Lists all available SOPs in the `docs/sops/` and `sops/` directories.

### `sop_execute(name: string, input: string)`
Executes a specific SOP.
- `name`: The filename of the SOP (e.g., `deploy_production`).
- `input`: Context or specific parameters for this run (e.g., "version=1.2.3").

### `validate_sop(name: string)`
Validates that a Markdown file is correctly formatted as an SOP (has title and steps).

### `sop_create(name: string, content: string)`
Creates a new SOP file with the provided content.

## Architecture

1.  **Parser**: Reads the Markdown and creates a structured object (`title`, `steps`).
2.  **Executor**:
    *   Initializes MCP to find all available tools.
    *   Queries `brain_query` for past execution logs of this SOP.
    *   Iterates through each step:
        *   Constructs a system prompt with the step instruction, available tools, and past context.
        *   Uses the LLM to decide which tool to call.
        *   Executes the tool and feeds the output back to the LLM.
        *   Retries up to 3 times with exponential backoff if a step fails.
    *   Logs the step outcome to `.agent/brain/sop_logs.json`.
3.  **Completion**: Calls `log_experience` to store the full execution summary in the Brain.

## Best Practices

*   **Be Explicit**: Write clear instructions in each step.
*   **Atomic Steps**: Keep steps focused on a single action (e.g., "Run tests" instead of "Run tests and deploy").
*   **Use Standard Tools**: Ensure the agent has access to the necessary tools (e.g., ensure `git` server is running if the SOP involves git operations).
