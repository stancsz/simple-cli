# Security Hardening MCP Server (`security_monitor`)

The Security Hardening MCP server is responsible for continuously monitoring, auditing, and protecting the agency's digital assets. It automates vulnerability discovery and remediation, and flags anomalous API activity.

## Architecture & Responsibilities

The server operates as an autonomous security layer integrated with the Brain (for episodic memory) and Health Monitor (for real-time metrics and alerting).

**Core Responsibilities:**
1.  **Dependency Auditing:** Regularly scans Node.js dependencies for CVEs using `npm audit`.
2.  **API Activity Monitoring:** Analyzes API logs (rate limiting, error spikes) against predefined thresholds.
3.  **Automated Remediation:** Autonomously creates PRs to update vulnerable packages.
4.  **Reporting:** Synthesizes security events into actionable summaries for C-suite review.

## Tools

*   **`scan_dependencies`**: Executes `npm audit --json`. Parses the output to quantify vulnerabilities (Critical, High, Moderate, Low). Emits metrics to the `health_monitor` (e.g., `vulnerabilities_found`) and logs the scan event to `EpisodicMemory`.
*   **`monitor_api_activity`**: Accepts a structured array of API log data. Calculates error rates and tracks high-latency requests. If thresholds defined in `.agent/security_policy.json` are breached, it triggers alerts (e.g., `api_error_spike`) via `logMetric` and logs the anomaly.
*   **`apply_security_patch`**: A secure tool that performs automated git operations to bump vulnerable packages to their target versions. It safely checks out a new branch, runs `npm install`, commits changes, pushes to remote, and uses the `gh` CLI to open a Pull Request documenting the CVE.
*   **`generate_security_report`**: Queries `EpisodicMemory` for recent `security_event` logs, synthesizing them via an LLM into a comprehensive executive report outlining vulnerabilities, anomalies, applied patches, and recommendations.

## Configuration Guide (`.agent/security_policy.json`)

To customize the security constraints, edit the `.agent/security_policy.json` file.

```json
{
  "api_monitoring": {
    "error_rate_percent": 5,
    "max_latency_ms": 1000
  },
  "auto_patch": {
    "severity_levels": [
      "critical",
      "high"
    ]
  },
  "dependency_scan": {
    "frequency": "daily"
  }
}
```

*   `error_rate_percent`: Percentage of 4xx/5xx errors allowed before an anomaly alert is fired.
*   `max_latency_ms`: Duration threshold (in milliseconds) defining a slow request.
*   `severity_levels`: The severity level at which the auto-patcher is permitted to autonomously open a Pull Request.

## Integration

*   **Brain MCP (`EpisodicMemory`)**: All security events, patch applications, and anomalies are saved with the `security_event` type, making them queryable for historical reporting and audit trailing.
*   **Health Monitor (`logger.js`)**: Real-time alerts are surfaced on the Dashboard via the `logMetric` function, allowing the Operational Persona to react instantly to sudden `api_error_spike` or `vulnerabilities_found` events.

## Cross-Region Security Considerations

In a multi-region deployment (Phase 27 High Availability), the Security Monitor MCP maintains an active presence across all geographic locations:

1. **Regional Audit Isolation:** Vulnerability scans (`npm audit`) occur independently within each regional StatefulSet. This ensures that regional variances in dependencies or rogue node injections are caught locally.
2. **Distributed Anomaly Detection:** The `monitor_api_activity` tool tracks rate limits and anomalies on a per-region basis. If traffic in `us-east-1` surges with malformed payloads, only the `us-east-1` Health Monitor will register the anomaly, allowing precise geographic incident isolation.
3. **Failover Security Policies:** During a disaster recovery scenario or simulated regional outage, the `apply_security_patch` process will continue operating seamlessly in the healthy region, ensuring zero downtime for security remediations.
4. **Encrypted Cross-Region Memory Synchronization:** The Brain (LanceDB/Graph) continuously synchronizes `security_event` memories across regions using AES-256-GCM encryption (via `backup_manager.ts`), preserving audit trails even in the event of total regional data loss.
