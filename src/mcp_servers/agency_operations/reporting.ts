import { WorkflowRegistry } from "./workflows.js";

export class ReportingEngine {
  constructor(private registry: WorkflowRegistry) {}

  async generateReport(client: string): Promise<string> {
    const workflows = await this.registry.list(client);

    let report = `# Agency Report for ${client}\n\n`;
    report += `Generated at: ${new Date().toISOString()}\n\n`;

    report += `## Workflow Status\n`;
    if (workflows.length === 0) {
        report += "No workflows found.\n";
    } else {
        for (const wf of workflows) {
          report += `- **${wf.type}** (ID: ${wf.id}): ${wf.status}\n`;
          if (wf.last_run) report += `  - Last Run: ${wf.last_run}\n`;
          if (wf.next_run) report += `  - Next Run: ${wf.next_run}\n`;
        }
    }

    report += `\n## Recent Activity\n`;
    // Aggregate history
    const allEvents = workflows.flatMap(w => w.history.map(h => ({ ...h, wfId: w.id, wfType: w.type })));
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (allEvents.length === 0) {
        report += "No recent activity.\n";
    } else {
        for (const event of allEvents.slice(0, 10)) {
            report += `- [${event.timestamp}] (${event.wfType}): ${event.message}\n`;
        }
    }

    return report;
  }
}
