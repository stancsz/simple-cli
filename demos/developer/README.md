# General Purpose Developer Agent Demo

## Overview
This demo showcases "Simple" as a versatile Developer Agent. The agent can take a bug report or feature request from Slack/GitHub, understand the codebase, create a plan, write code, run tests, and create a Pull Request.

## Scenario
**Role**: Software Engineer
**Task**: Receive a bug report about an incorrect calculation in a Python script, reproduce it with a test case, fix the bug, and open a PR.
**Platform**: Slack + GitHub
**Tools**: Git, File System, Python/Java/JS (Language Agnostic)

## Setup
1. **Ensure Dependencies**:
   - Git repository initialized.
   - Python installed (for this specific demo).

2. **Configuration**:
   - Ensure a GitHub token is set as `GITHUB_TOKEN`.
   - Ensure `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` are set for Slack integration.

## Files
- `calculator.py`: A simple calculator script with a bug (e.g., division by zero not handled properly).
- `test_calculator.py`: A failing test case reproducing the bug.

## Running the Demo (CLI Simulation)
To simulate the agent's behavior:

```bash
# Set the active skill
$env:SIMPLE_CLI_SKILL="code"

# Run the agent in the demo directory
cd demos/developer/bug_repo
cp ../calculator.py .  # Copy the buggy script
cp ../test_calculator.py .  # Copy the test script

# Simulate the user request
../../bin/simple "I'm getting a ZeroDivisionError in calculator.py. Fix the bug so it returns 'Error' instead of crashing. Run the test_calculator.py to verify the fix. Then create a new branch 'fix-calculator-bug', commit the changes, and push it."
```

## Running the Demo (Slack Integration)
1. Start the server:
   ```bash
   npm run start:slack
   ```
2. In Slack, mention the bot:
   > "@Simple I'm getting a ZeroDivisionError in calculator.py. Fix the bug so it returns 'Error' instead of crashing. Run the test_calculator.py to verify the fix. Then create a new branch 'fix-calculator-bug', commit the changes, and push it."

## Key "Human-like" Features to Highlight
1. **Understanding Context**: The agent reads the file to understand the logic before modifying it.
2. **Standard Workflow**: It follows best practices: reproduce -> fix -> verify -> commit -> push.
3. **Communication**: It explains its plan ("I will first read the file...", "I will now run the test...") in the chat thread.
4. **Resilience**: If the test fails after the fix, it iterates until it passes.
