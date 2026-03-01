# Security Monitor MCP

The **Security Monitor MCP** is a critical enterprise resilience feature introduced in Phase 27 of the Simple Biosphere roadmap. It proactively protects the agency from vulnerabilities and anomalous activity by leveraging automated vulnerability scanning, API activity monitoring, and automated patch creation.

## Overview

The `security_monitor` MCP server exposes a suite of tools designed to ensure the continuous security and stability of the system. It runs on-demand and integrates with the existing Corporate Brain for episodic memory and alerting.

## Tools

The server provides three core tools:

### 1. `scan_dependencies`
Runs a dependency audit (using `npm audit --json`) to detect critical, high, moderate, and low Common Vulnerabilities and Exposures (CVEs) in project dependencies.
- **Outputs**: A structured JSON report detailing found vulnerabilities and severity counts.
- **Side-effects**: Logs metrics to the system (e.g., `vulnerabilities_found`) and stores an episodic memory event (`security_event`) documenting the scan results.

### 2. `monitor_api_activity`
Analyzes recent API activity logs (e.g., from Health Monitor or system logs) for anomalous patterns.
- **Inputs**: Requires an array of `activity_logs` (timestamp, endpoint, status, and optional duration).
- **Behavior**: Evaluates logs against configurable thresholds for error rates and latency.
- **Outputs**: A status report highlighting detected anomalies (e.g., "Error rate exceeds threshold" or "High latency spikes detected").
- **Side-effects**: Logs anomaly metrics and stores a `security_event` memory if anomalies are found.

### 3. `apply_security_patch`
Automatically creates a GitHub Pull Request (PR) to update a vulnerable dependency to a patched version.
- **Inputs**: Requires the `package_name` and `target_version`. Optionally accepts a `cve_id`.
- **Behavior**:
  - Branches off the current branch safely.
  - Installs the specified target version of the package.
  - Commits the `package.json` and `package-lock.json` changes.
  - Pushes the branch and creates a PR via the GitHub CLI (`gh pr create`).
- **Safety Protocol**: This tool *does not* auto-merge the PR. It requires manual approval (or Dual-Verification) to ensure stability before merging.
- **Side-effects**: Stores a `security_event` memory documenting the patch application.

### 4. `generate_security_report`
Generates a comprehensive weekly security status summary by querying the Brain MCP for recent security events.
- **Outputs**: A Markdown-formatted executive summary of vulnerabilities, API anomalies, applied patches, and recommendations.

## Configuration

The behavior of the Security Monitor is governed by the `.agent/security_policy.json` configuration file.

### Example `security_policy.json`:

```json
{
  "api_monitoring": {
    "error_rate_percent": 5,
    "max_latency_ms": 1000
  },
  "auto_patch": {
    "severity_levels": ["critical", "high"]
  }
}
```

- **`api_monitoring`**: Defines the thresholds for anomaly detection. `error_rate_percent` sets the maximum acceptable error rate before an anomaly is flagged. `max_latency_ms` defines the maximum acceptable response time.
- **`auto_patch`**: Determines which vulnerability severity levels trigger automated patch applications.

If the `security_policy.json` file is missing, the tools will fall back to sensible defaults.

## Integration

The Security Monitor is registered in `mcp.json` and can be invoked autonomously by the Simple Biosphere orchestrator or via scheduled cron jobs.

- **Corporate Brain**: Security events are stored as `security_event` types in the Episodic Memory, allowing the C-Suite personas and other swarms to recall and react to security incidents during Board Meetings or strategic planning.
- **Metrics Logging**: Integrates with the `logMetric` utility to feed data into the Health Monitor and Dashboard.
- **GitHub**: Integrates with the GitHub CLI (`gh`) to create PRs, leveraging the existing authentication setup.

### 5. `simulate_regional_outage`
Simulates a regional failure in our multi-region Kubernetes setup.
- **Inputs**: Requires `region` (e.g., 'us-east-1'), `failure_type` ('network', 'node', 'zone'), and `duration_seconds`.
- **Behavior**: Uses the Kubernetes client (`@kubernetes/client-node`) to cordon nodes or delete pods, tracking recovery time and logging failover metrics.
- **Side-effects**: Logs metrics to the system (`regional_failover_recovery_time`) and stores an episodic memory event (`resilience_event`).

### 6. `run_penetration_test`
Simulates common attacks against API endpoints.
- **Inputs**: Requires `target_url` and `attack_vectors` (e.g., 'sqli', 'xss', 'credential_stuffing').
- **Behavior**: Uses `axios` to send malicious payloads to our own endpoints (configured via `INTERNAL_API_BASE`). It evaluates responses against thresholds to verify detection capabilities and generates a compliance report via LLM.
- **Outputs**: Markdown report with detection results and triggered alerts.
- **Side-effects**: Stores an episodic memory event (`security_event`) and potentially triggers metric alarms.
