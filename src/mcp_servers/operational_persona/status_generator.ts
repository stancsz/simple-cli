import { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface HealthReport {
  [key: string]: {
    count: number;
    min: number;
    max: number;
    avg: number;
    sum: number;
  };
}

export class StatusGenerator {
  constructor(private brainClient: Client, private healthClient: Client) {}

  async getSystemStatus(): Promise<string> {
    try {
      // 1. Get Health Report
      const reportResult: any = await this.healthClient.callTool({
        name: "get_health_report",
        arguments: { timeframe: "last_day" }
      });

      let report: HealthReport = {};
      try {
        if (reportResult?.content?.[0]?.text) {
          report = JSON.parse(reportResult.content[0].text);
        }
      } catch (e) {
        console.error("Failed to parse health report:", e);
      }

      // 2. Get Company Metrics (Brain-based)
      let companyMetricsText = "";
      try {
          const metricsResult: any = await this.healthClient.callTool({
              name: "get_company_metrics",
              arguments: {}
          });
          if (metricsResult?.content?.[0]?.text) {
              const metrics = JSON.parse(metricsResult.content[0].text);
              const companies = Object.keys(metrics);
              if (companies.length > 0) {
                 let totalCost = 0;
                 let totalTasks = 0;
                 for (const c of companies) {
                     if (metrics[c].estimated_cost_usd) totalCost += metrics[c].estimated_cost_usd;
                     if (metrics[c].task_count) totalTasks += metrics[c].task_count;
                 }
                 companyMetricsText = `Active Companies: ${companies.length}. Total Cost: $${totalCost.toFixed(2)}. Tasks: ${totalTasks}.`;
              }
          }
      } catch (e) {
          console.warn("Failed to fetch company metrics:", e);
      }

      // 3. Check Alerts
      const alertsResult: any = await this.healthClient.callTool({
        name: "check_alerts",
        arguments: {}
      });
      const alertText = alertsResult?.content?.[0]?.text || "No alerts triggered.";
      const hasCritical = alertText.includes("ALERT:");

      // 4. Format Status
      const systemState = hasCritical ? "⚠️ Systems degraded" : "🟢 Systems nominal";

      // Calculate average latency across all agents if available
      // Look for metric ending in 'latency'
      let totalLatency = 0;
      let latencyCount = 0;
      let tokenUsage = 0;

      for (const [key, stats] of Object.entries(report)) {
        if (key.includes("latency")) {
          totalLatency += stats.sum;
          latencyCount += stats.count;
        }
        if (key.includes("tokens") || key.includes("token_usage")) {
          tokenUsage += stats.sum;
        }
      }

      const avgLatency = latencyCount > 0 ? (totalLatency / latencyCount).toFixed(2) : "N/A";
      const tokenStr = tokenUsage > 1000 ? `${(tokenUsage / 1000).toFixed(1)}k` : tokenUsage.toString();

      return `${systemState}. Average response time: ${avgLatency}ms. Token usage: ${tokenStr} today. ${companyMetricsText} ${hasCritical ? `Alerts: ${alertText}` : "No critical alerts."}`;

    } catch (error: any) {
      console.error("Error generating system status:", error);
      return "🔴 System status unavailable due to internal error.";
    }
  }

  async getAgentActivityReport(): Promise<string> {
    try {
      // Query Brain for recent activities
      // We look for specific agents or task types based on log_experience conventions
      const query = "Agent: autonomous-executor OR Agent: Reviewer OR Agent: Dreaming";

      const brainResult: any = await this.brainClient.callTool({
        name: "brain_query",
        arguments: {
            query,
            limit: 20,
            format: "json" // Request JSON for better parsing
        }
      });

      let memories: any[] = [];
      try {
          if (brainResult?.content?.[0]?.text) {
              memories = JSON.parse(brainResult.content[0].text);
          }
      } catch {
          // Fallback to empty
      }

      if (memories.length === 0) {
          return "No recent autonomous agent activity recorded.";
      }

      // Summarize
      let jobDelegatorCount = 0;
      let reviewerCount = 0;
      let dreamingCount = 0;
      let dreamingResolved = 0;

      for (const mem of memories) {
          const content = (mem.userPrompt + " " + mem.agentResponse).toLowerCase();

          if (content.includes("agent: autonomous-executor") || content.includes("job delegator")) {
              jobDelegatorCount++;
          }
          if (content.includes("agent: reviewer")) {
              reviewerCount++;
          }
          if (content.includes("agent: dreaming")) {
              dreamingCount++;
              if (mem.resolved_via_dreaming) {
                  dreamingResolved++;
              }
          }
      }

      return `Job Delegator processed ${jobDelegatorCount} tasks. Reviewer actions detected: ${reviewerCount}. Dreaming simulations run: ${dreamingCount} (Resolved: ${dreamingResolved}).`;

    } catch (error: any) {
      console.error("Error generating activity report:", error);
      return "Unable to retrieve agent activity report.";
    }
  }
}
