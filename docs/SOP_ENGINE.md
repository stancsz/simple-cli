# SOP Engine (SOP-as-Code)

The **SOP Engine** is a core component of the Simple CLI ecosystem that enables the automation of professional workflows through "Standard Operating Procedures" (SOPs). It allows you to define complex, multi-step tasks in simple Markdown files, which are then executed autonomously by an AI agent using available MCP tools.

## Key Concepts

*   **SOP-as-Code**: Treat your operating procedures like software. Version control them, review them, and execute them programmatically.
*   **Markdown Definition**: SOPs are written in standard Markdown, making them easy to read and edit for humans.
*   **Autonomous Execution**: The engine parses the SOP and uses an LLM (Large Language Model) to reason about each step, select the appropriate tools, and handle errors.
*   **Tool Discovery**: The engine automatically discovers and uses any available MCP tool (e.g., `git`, `filesystem`, `brain`, `browser`) to complete steps.

## Usage

### 1. Listing Available SOPs

Use the `sop_list` tool to see all available SOPs in the `docs/sops/` directory.

```bash
sop_list()
```

### 2. Executing an SOP

Use the `sop_execute` tool to run a specific SOP. You can provide an `input` context to guide the execution.

```bash
sop_execute(name="deploy_to_aws", input="Deploy the current branch to the staging environment")
```

### 3. Creating a New SOP

Use the `sop_create` tool to define a new procedure.

```bash
sop_create(name="new_employee_onboarding", content="# New Employee Onboarding...")
```

## SOP Format

SOPs are Markdown files located in `docs/sops/`. The engine parses them based on specific conventions:

### Structure

1.  **Title**: The first H1 header (`# Title`) defines the SOP name.
2.  **Description**: Text following the title (before the first step) is treated as the overall goal/description.
3.  **Steps**: Numbered lists (`1. Step Name`) define the sequence of actions.
    *   **Step Name**: Can be bolded (`**Step Name**`) or plain text.
    *   **Step Description**: Text following the step name provides detailed instructions for the agent.

### Example SOP (`docs/sops/example_workflow.md`)

```markdown
# Example Workflow

This SOP demonstrates a simple workflow to research a topic and save the results.

1. **Research**
   Use the `browser` tool to search for the latest news on "AI Agents". Summarize the top 3 findings.

2. **Save Results**
   Create a new file named `research_results.md` using the `filesystem` tool. Write the summary from Step 1 into this file.

3. **Verify**
   Read the file `research_results.md` to ensure the content was written correctly.
```

## Architecture

The SOP Engine consists of three main parts:

1.  **Parser (`sop_parser.ts`)**: Converts raw Markdown into a structured `SOP` object containing title, description, and a list of steps.
2.  **Executor (`executor.ts`)**: The runtime engine.
    *   It iterates through each step.
    *   It constructs a dynamic prompt for the LLM, including the current step instructions, history of previous steps, and available tools.
    *   It handles the `complete_step` and `fail_step` signals from the agent.
    *   It implements a retry mechanism (default 5 retries) for robust execution.
3.  **MCP Server (`index.ts`)**: Exposes the `sop_list`, `sop_execute`, and `sop_create` tools to the wider Simple CLI ecosystem.

## Error Handling

*   **Retries**: If a tool fails or the agent makes a mistake, the Executor feeds the error back to the agent, allowing it to self-correct (up to `maxRetries`).
*   **Fatal Errors**: If a step is impossible to complete, the agent can call `fail_step` to halt execution immediately.
*   **Context**: The Executor maintains a summary of completed steps to ensure the agent has the necessary context for subsequent actions.
