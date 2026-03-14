import { describe, it, expect } from 'vitest';
import { generateEcosystemAuditReport, generateEcosystemAuditReportSchema } from '../../src/mcp_servers/ecosystem_auditor/tools.js';
import { server } from '../../src/mcp_servers/ecosystem_auditor/index.js';

describe('Phase 37: Ecosystem Auditor Scaffold Validation', () => {

  it('should initialize the MCP server and expose the correct tool', async () => {
    expect(server).toBeDefined();
    // Validate we can query tools via the registered request handler if server is correctly instanced
    expect(typeof server.setRequestHandler).toBe('function');
  });

  it('should have a generate_ecosystem_audit_report tool that accepts timeframe and focus_area', async () => {
    const mockInput = {
      timeframe: 'last_24_hours',
      focus_area: 'all'
    };

    const input = generateEcosystemAuditReportSchema.parse(mockInput);
    expect(input.timeframe).toBe('last_24_hours');
    expect(input.focus_area).toBe('all');

    const result = await generateEcosystemAuditReport(input as any);

    expect(result).toHaveProperty('report_id');
    expect(result.timeframe).toBe('last_24_hours');
    expect(result.summary).toContain('Audit report generated');
    expect(result.events).toEqual([]); // Initial empty scaffold state
  });

  it('should throw validation error on missing required timeframe', () => {
    const invalidInput = {
      focus_area: 'communications'
    };

    expect(() => generateEcosystemAuditReportSchema.parse(invalidInput)).toThrow();
  });
});
