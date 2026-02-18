# Oil & Gas Analytics Agent Demo

## Overview
This demo showcases an AI agent ("Jules - Oil & Gas Specialist") that acts as a Senior Data Scientist. The agent runs in a **Microsoft Teams** environment (can also run in Slack), calculates production metrics from CSV data, generates visualizations, and commits the results to a Git repository.

## Scenario
**Role**: Senior Production Engineer / Data Scientist
**Task**: Analyze well production data to identify underperforming wells and generate a daily report.
**Platform**: Microsoft Teams + GitHub
**Tools**: Python (pandas, matplotlib), Git, File System

## Setup
1. **Ensure Dependencies**:
   - Python installed with `pandas`, `matplotlib` (Agent will try to use them).
   - `npm install` run in the root `simple-cli` directory.

2. **Configuration**:
   - Ensure `.env` has `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD` (for Teams) or `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` (for Slack).
   - If running locally without real Teams/Slack credentials, you can use the **CLI mode** with the `oil_gas` skill to simulate the behavior.

## Running the Demo (CLI Simulation)
To simulate the agent's behavior without needing a live Teams bot:

```bash
# Set the active skill
$env:SIMPLE_CLI_SKILL="oil_gas"

# Run the agent in the demo directory
cd demos/oil_gas
../../bin/simple "Analyze 'data/production_history.csv'. Calculate the average daily oil production for each well. If any well is below 200 bbl/d, flag it as 'Low Production'. Generate a bar chart 'production_chart.png' comparing the wells. Save the summary to 'report.md' and commit both files to git with message 'Daily Production Report'."
```

## Running the Demo (Teams/Slack)
1. Start the server:
   ```bash
   # For Teams
   npm run start:teams
   
   # For Slack
   npm run start:slack
   ```
2. In the chat application, send the prompt:
   > "Analyze 'demos/oil_gas/data/production_history.csv'. Calculate the average daily oil production for each well. If any well is below 200 bbl/d, flag it as 'Low Production'. Generate a bar chart 'production_chart.png' comparing the wells. Save the summary to 'report.md' and commit both files to git with message 'Daily Production Report'."

## Key "Human-like" Features to Highlight
1. **Domain Expertise**: The agent understands "bbl/d", "tubing pressure", and uses specialized libraries.
2. **End-to-End Workflow**: It doesn't just write code; it *executes* it, verifies output, and handles version control (Git).
3. **Self-Correction**: If the Python script fails (e.g., missing library), the agent reads the error, corrects the script, and re-runs it.
4. **Professional Output**: The generated report and commit messages are professional and structured.
