import { EcosystemAuditReport, AuditEvent } from './types.js';
import { GenerateEcosystemAuditReportInput } from './tools.js';
import { auditLogger } from './audit_logger.js';
import { createLLM } from '../../llm.js';
import crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function generateAuditReport(input: GenerateEcosystemAuditReportInput): Promise<EcosystemAuditReport> {
    const timeframeMinutes = parseTimeframe(input.timeframe);

    // Fetch logs from the logger
    const logs = await auditLogger.fetchLogs(timeframeMinutes, input.focus_area, input.agency_id);

    const reportId = `report-${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    if (logs.length === 0) {
        return {
            report_id: reportId,
            timestamp,
            timeframe: input.timeframe,
            focus_area: input.focus_area,
            executive_summary: "No events found for the specified timeframe and focus area.",
            key_findings: [],
            compliance_status: "compliant",
            recommendations: [],
            events_analyzed: 0
        };
    }

    const llm = createLLM("default");

    // Create a summarized version of logs to prevent context window overflow
    const maxLogs = 100;
    const logsToAnalyze = logs.slice(Math.max(0, logs.length - maxLogs));

    const prompt = `
    Analyze the following cross-agency ecosystem audit logs and generate a structured JSON report.

    Timeframe: ${input.timeframe}
    Focus Area: ${input.focus_area}
    Logs Analyzed: ${logsToAnalyze.length} (latest shown)

    Logs:
    ${JSON.stringify(logsToAnalyze, null, 2)}

    You must return a raw JSON object with exactly the following structure:
    {
      "executive_summary": "A concise summary of the ecosystem's behavior.",
      "key_findings": ["Finding 1", "Finding 2"],
      "compliance_status": "compliant" | "warning" | "non_compliant",
      "recommendations": ["Recommendation 1", "Recommendation 2"]
    }
    `;

    const response = await llm.generate(prompt, []);
    let llmResult;
    try {
        const jsonMatch = response.raw?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            llmResult = JSON.parse(jsonMatch[0]);
        } else {
            llmResult = JSON.parse(response.raw || "{}");
        }
    } catch (e) {
        // Fallback if JSON parsing fails
        llmResult = {
            executive_summary: "Failed to parse LLM analysis. Raw output: " + (response.raw?.substring(0, 100) || "none"),
            key_findings: ["Parsing error"],
            compliance_status: "warning",
            recommendations: []
        };
    }

    const report: EcosystemAuditReport = {
        report_id: reportId,
        timestamp,
        timeframe: input.timeframe,
        focus_area: input.focus_area,
        executive_summary: llmResult.executive_summary || "No summary provided.",
        key_findings: llmResult.key_findings || [],
        compliance_status: ["compliant", "warning", "non_compliant"].includes(llmResult.compliance_status) ? llmResult.compliance_status : "compliant",
        recommendations: llmResult.recommendations || [],
        events_analyzed: logs.length
    };

    // Write the report to disk asynchronously
    await storeReport(report);

    return report;
}

async function storeReport(report: EcosystemAuditReport) {
    const baseDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), '.agent');
    const reportsDir = path.join(baseDir, 'ecosystem_audit', 'reports');

    try {
        await fs.access(reportsDir);
    } catch {
        await fs.mkdir(reportsDir, { recursive: true });
    }

    const filePath = path.join(reportsDir, `${report.report_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}

function parseTimeframe(timeframe: string): number | undefined {
    if (timeframe === 'last_24_hours') return 24 * 60;
    if (timeframe === 'last_7_days') return 7 * 24 * 60;
    if (timeframe === 'last_1_hour') return 60;

    // Parse format like 'X_hours' or 'X_days'
    const parts = timeframe.split('_');
    if (parts.length >= 2) {
        const num = parseInt(parts[0] === 'last' ? parts[1] : parts[0], 10);
        if (!isNaN(num)) {
            if (timeframe.includes('hour')) return num * 60;
            if (timeframe.includes('day')) return num * 24 * 60;
            if (timeframe.includes('minute')) return num;
        }
    }

    return undefined; // All time
}
