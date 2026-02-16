# SOP: {{SOP_NAME}}

{{DESCRIPTION}}

## Steps

- Check Prerequisites
  description: Ensure all necessary tools and access tokens are available.
  tool: llm
  args: {"prompt": "Check if required tools are available."}

- {{STEP_1_NAME}}
  description: {{STEP_1_DESCRIPTION}}
  tool: {{TOOL_NAME}}
  args: {
    "arg1": "{{ARG_VALUE}}"
  }

- Conditional Step Example
  description: Run this only if the parameter 'run_extra' is true.
  condition: {{params.run_extra}} == true
  tool: llm
  args: {"prompt": "Running extra step."}

- Rollback Example
  description: This step has a rollback defined.
  tool: some_tool
  rollback: { "tool": "undo_tool", "args": {} }
