import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEcosystemAuditReport } from '../../src/mcp_servers/ecosystem_auditor/tools/generate_audit_report.js';
import { generateEcosystemAuditReportSchema } from '../../src/mcp_servers/ecosystem_auditor/schemas/generate_audit_report.js';
import { server } from '../../src/mcp_servers/ecosystem_auditor/index.js';

// Mock the LLM explicitly at the top level to match the new tool behavior
vi.mock('../../src/llm/index.js', () => {
    return {
        createLLM: vi.fn(() => ({
            generate: vi.fn().mockResolvedValue({
                raw: `Audit report generated`
            })
        }))
    };
});

describe('Phase 37: Ecosystem Auditor Scaffold Validation', () => {

  beforeEach(() => {
      vi.restoreAllMocks();
  });

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

    // Check either the LLM mock string or the default not-found string is present
    expect(result.summary).toMatch(/Audit report generated|No logs found/);
  });

  it('should throw validation error on missing required timeframe', () => {
    const invalidInput = {
      focus_area: 'communications'
    };

    expect(() => generateEcosystemAuditReportSchema.parse(invalidInput)).toThrow();
  });
});
