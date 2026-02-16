import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export class Reviewer {
  private logsDir: string;
  private reportsDir: string;

  constructor(agentDir: string) {
    this.logsDir = join(agentDir, 'ghost_logs');
    this.reportsDir = join(agentDir, 'daily_reports');
  }

  async runMorningStandup(): Promise<string> {
    await this.ensureDirs();

    const logs = await this.getRecentLogs(24 * 60 * 60 * 1000); // 24 hours
    const summary = this.generateSummary(logs);

    const reportPath = join(this.reportsDir, `standup_${new Date().toISOString().split('T')[0]}.md`);
    await writeFile(reportPath, summary);

    return summary;
  }

  private async ensureDirs() {
    if (!existsSync(this.reportsDir)) {
      await mkdir(this.reportsDir, { recursive: true });
    }
  }

  private async getRecentLogs(timeWindow: number): Promise<any[]> {
    if (!existsSync(this.logsDir)) return [];

    const files = await readdir(this.logsDir);
    const now = Date.now();
    const logs = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await readFile(join(this.logsDir, file), 'utf-8');
        const log = JSON.parse(content);

        // Use endTime or startTime
        const logTime = log.endTime || log.startTime;
        if (now - logTime < timeWindow) {
          logs.push(log);
        }
      } catch (e) {
        console.error(`Error reading log file ${file}:`, e);
      }
    }

    return logs.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  }

  private generateSummary(logs: any[]): string {
    if (logs.length === 0) {
      return "# Morning Standup\n\nNo tasks executed in the last 24 hours.";
    }

    let report = `# Morning Standup - ${new Date().toLocaleDateString()}\n\n`;
    report += `**Total Tasks:** ${logs.length}\n`;

    const successful = logs.filter(l => l.status === 'success').length;
    const failed = logs.filter(l => l.status === 'failed').length;

    report += `**Success:** ${successful}\n`;
    report += `**Failed:** ${failed}\n\n`;

    report += "## Task Details\n\n";

    for (const log of logs) {
      const statusIcon = log.status === 'success' ? '✅' : '❌';
      const duration = log.endTime ? ((log.endTime - log.startTime) / 1000).toFixed(2) + 's' : 'N/A';

      report += `### ${statusIcon} ${log.taskName || log.taskId}\n`;
      report += `- **ID:** ${log.taskId}\n`;
      report += `- **Status:** ${log.status}\n`;
      report += `- **Duration:** ${duration}\n`;
      if (log.errorMessage) {
        report += `- **Error:** ${log.errorMessage}\n`;
      }
      report += "\n";
    }

    return report;
  }
}
