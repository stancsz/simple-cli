# Security Monitor MCP

The **Security Monitor MCP** (`security_monitor`) is responsible for the enterprise security hardening of the Simple Biosphere. It provides tools to autonomously scan for dependency vulnerabilities, monitor internal system activity for anomalies, and preemptively apply security patches.

## Tools Overview

### 1. `scan_dependencies`
Executes `npm audit` across the project to identify vulnerabilities in dependencies.
- Parses the output into a structured severity mapping (Critical, High, Moderate, Low).
- Uses the `LLM` to generate a concise, human-readable summary of the security posture.
- Ideal for periodic checks (e.g., daily) via the Scheduler.

### 2. `monitor_api_activity`
Analyzes internal metrics (e.g., failed API calls, system errors) logged by the `health_monitor` MCP.
- Establishes a mathematical baseline (average and standard deviation) from historical data.
- Detects anomalies in real-time if the current failure rate exceeds the standard deviation threshold.
- Helps in identifying potential internal system abuse or configuration drifts.

### 3. `apply_security_patch`
Automates the resolution of critical or high-severity CVEs in NPM dependencies.
- Accepts a package name and target version.
- Automatically creates a new Git branch, applies the patch via `npm install`, and commits the changes.
- Uses the GitHub API to open a Pull Request (PR) for final human review.

## Integration & Scheduling
The `security_monitor` is designed to be fully autonomous. It includes a `scheduler_integration` module that adds a `security-scan-daily` task to the `.agent/scheduler.json` file. This ensures `scan_dependencies` and `monitor_api_activity` run periodically without human intervention.

## Configuration
Requires `GITHUB_TOKEN` in the environment (`.env.agent`) to successfully open Pull Requests via the GitHub API. If the token is missing, the tool will still create the branch locally but skip the PR creation.