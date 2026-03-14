import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { server } from '../../src/mcp_servers/ecosystem_auditor/index.js';
import { AuditLogger, auditLogger } from '../../src/mcp_servers/ecosystem_auditor/audit_logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock the LLM to prevent real API calls during tests
vi.mock('../../src/llm.js', () => ({
  createLLM: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      raw: JSON.stringify({
        executive_summary: "Mocked ecosystem analysis summary.",
        key_findings: ["Mocked finding 1", "Mocked finding 2"],
        compliance_status: "compliant",
        recommendations: ["Mocked recommendation 1"]
      })
    }),
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
  }))
}));

describe('Phase 37: Ecosystem Auditor Validation', () => {
  const tempTestDir = path.join(process.cwd(), '.agent', 'test_ecosystem_audit');

  beforeAll(async () => {
    // Override the logs directory for the singleton logger during testing
    (auditLogger as any).logsDir = path.join(tempTestDir, 'logs');
    (auditLogger as any).logFilePath = path.join(tempTestDir, 'logs', 'audit.jsonl');

    // Set a custom environment variable for tests that might use it
    process.env.JULES_AGENT_DIR = tempTestDir;

    // Ensure clean state
    await fs.rm(tempTestDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(path.join(tempTestDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(tempTestDir, 'reports'), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempTestDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should successfully log different types of audit events', async () => {
    // Test direct logger functionality
    const event1 = await auditLogger.logEvent({
      event_type: "cross_agency_communication",
      source_agency: "agency_A",
      target_agency: "agency_B",
      agencies_involved: ["agency_A", "agency_B"],
      payload: { message: "Task delegated" }
    });

    const event2 = await auditLogger.logEvent({
      event_type: "policy_change",
      source_agency: "root",
      agencies_involved: ["root"],
      payload: { rule: "Max tokens 5000" }
    });

    expect(event1.event_id).toBeDefined();
    expect(event1.timestamp).toBeDefined();
    expect(event1.event_type).toBe("cross_agency_communication");

    // Verify logs were written to file
    const fileContent = await fs.readFile((auditLogger as any).logFilePath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    expect(lines.length).toBe(2);

    const parsedEvent1 = JSON.parse(lines[0]);
    expect(parsedEvent1.payload.message).toBe("Task delegated");
  });

  it('should correctly filter fetched logs by timeframe and focus_area', async () => {
    const allLogs = await auditLogger.fetchLogs();
    expect(allLogs.length).toBeGreaterThanOrEqual(2);

    const commLogs = await auditLogger.fetchLogs(60, 'communications');
    expect(commLogs.length).toBe(1);
    expect(commLogs[0].event_type).toBe('cross_agency_communication');

    const policyLogs = await auditLogger.fetchLogs(60, 'policy_changes');
    expect(policyLogs.length).toBe(1);
    expect(policyLogs[0].event_type).toBe('policy_change');
  });

  it('should isolate logs when filtering by agency_id', async () => {
    const agencyALogs = await auditLogger.fetchLogs(undefined, 'all', 'agency_A');
    expect(agencyALogs.length).toBe(1);
    expect(agencyALogs[0].source_agency).toBe('agency_A');

    const unknownAgencyLogs = await auditLogger.fetchLogs(undefined, 'all', 'agency_XYZ');
    expect(unknownAgencyLogs.length).toBe(0);
  });

  it('should successfully handle MCP tool call: log_audit_event', async () => {
    const request = {
      method: "tools/call",
      params: {
        name: "log_audit_event",
        arguments: {
          event_type: "morphology_adjustment",
          source_agency: "root",
          agencies_involved: ["root", "agency_C"],
          payload: { action: "spawn" }
        }
      }
    };

    const result = await (server as any)._requestHandlers.get("tools/call")(request);
    expect(result.content[0].text).toContain("morphology_adjustment");

    // Verify it was actually logged
    const logs = await auditLogger.fetchLogs();
    expect(logs.some(l => l.event_type === "morphology_adjustment")).toBe(true);
  });

  it('should successfully handle MCP tool call: generate_ecosystem_audit_report', async () => {
    const request = {
      method: "tools/call",
      params: {
        name: "generate_ecosystem_audit_report",
        arguments: {
          timeframe: "last_24_hours",
          focus_area: "all"
        }
      }
    };

    const result = await (server as any)._requestHandlers.get("tools/call")(request);
    const reportStr = result.content[0].text;

    // Ensure it parsed to a valid JSON string containing the mocked report
    const report = JSON.parse(reportStr);

    expect(report.report_id).toBeDefined();
    expect(report.executive_summary).toBe("Mocked ecosystem analysis summary.");
    expect(report.compliance_status).toBe("compliant");
    expect(report.events_analyzed).toBe(3); // 2 from first test + 1 from MCP test

    // Wait for the report file to be written (it might be async depending on event loop scheduling)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify the report was stored on disk
    const reportsDir = path.join(tempTestDir, 'ecosystem_audit', 'reports');
    const reports = await fs.readdir(reportsDir);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports.some(r => r === `${report.report_id}.json`)).toBe(true);
  });

});
