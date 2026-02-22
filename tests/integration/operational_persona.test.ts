import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusGenerator } from '../../src/mcp_servers/operational_persona/status_generator.js';
import { PersonaFormatter } from '../../src/mcp_servers/operational_persona/persona_formatter.js';

// Mock PersonaEngine
vi.mock('../../src/persona.js', () => ({
  PersonaEngine: vi.fn().mockImplementation(() => ({
    loadConfig: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({}),
    transformResponse: vi.fn().mockImplementation((r: any) => Promise.resolve({ ...r, message: `😊 ${r.message} 🚀` }))
  }))
}));

describe('Operational Persona Integration', () => {
  let mockBrainClient: any;
  let mockHealthClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBrainClient = {
      callTool: vi.fn()
    };
    mockHealthClient = {
      callTool: vi.fn()
    };
  });

  describe('StatusGenerator', () => {
    it('should generate system status correctly with no alerts', async () => {
      const generator = new StatusGenerator(mockBrainClient, mockHealthClient);

      // Mock get_health_report response
      mockHealthClient.callTool.mockResolvedValueOnce({
        content: [{
            type: "text",
            text: JSON.stringify({
                'llm:latency': { sum: 100, count: 2, avg: 50, min: 40, max: 60, },
                'llm:tokens': { sum: 5000, count: 5, avg: 1000, min: 500, max: 1500 }
            })
        }]
      });
      // Mock get_company_metrics response
      mockHealthClient.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "{}" }]
      });
      // Mock check_alerts response
      mockHealthClient.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "No alerts triggered." }]
      });

      const status = await generator.getSystemStatus();
      expect(status).toContain("🟢 Systems nominal");
      expect(status).toContain("50.00ms");
      expect(status).toContain("5.0k today");
      expect(status).toContain("No critical alerts");
    });

    it('should report critical alerts', async () => {
        const generator = new StatusGenerator(mockBrainClient, mockHealthClient);

        mockHealthClient.callTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "{}" }]
        });
        // Mock get_company_metrics response
        mockHealthClient.callTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "{}" }]
        });
        mockHealthClient.callTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "ALERT: latency is 500 (> 200)" }]
        });

        const status = await generator.getSystemStatus();
        expect(status).toContain("⚠️ Systems degraded");
        expect(status).toContain("ALERT: latency");
    });

    it('should generate agent activity report', async () => {
        const generator = new StatusGenerator(mockBrainClient, mockHealthClient);

        // Mock brain_query response
        const mockMemories = [
            { userPrompt: "Agent: autonomous-executor Task: fix bug", agentResponse: "Outcome: success", resolved_via_dreaming: false },
            { userPrompt: "Agent: Reviewer Task: check PR", agentResponse: "Outcome: success", resolved_via_dreaming: false },
            { userPrompt: "Agent: Reviewer Task: check PR", agentResponse: "Outcome: failed", resolved_via_dreaming: false },
            { userPrompt: "Agent: Dreaming Task: retry", agentResponse: "Outcome: success", resolved_via_dreaming: true }
        ];

        mockBrainClient.callTool.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify(mockMemories) }]
        });

        const report = await generator.getAgentActivityReport();
        expect(report).toContain("Job Delegator processed 1 tasks");
        expect(report).toContain("Reviewer actions detected: 2");
        expect(report).toContain("Dreaming simulations run: 1 (Resolved: 1)");
    });
  });

  describe('PersonaFormatter', () => {
      it('should wrap text in persona voice', async () => {
          const formatter = new PersonaFormatter();
          await formatter.init();
          const result = await formatter.format("Systems nominal");
          expect(result).toBe("😊 Systems nominal 🚀");
      });
  });

  describe('Integration Logic (Simulated)', () => {
      it('should generate combined daily standup', async () => {
          const generator = new StatusGenerator(mockBrainClient, mockHealthClient);
          const formatter = new PersonaFormatter();
          await formatter.init();

          // Mock status responses
          mockHealthClient.callTool.mockResolvedValueOnce({
              content: [{ type: "text", text: JSON.stringify({'llm:latency': { sum: 100, count: 2, avg: 50, min: 40, max: 60 }}) }]
          });
          // Mock get_company_metrics response
          mockHealthClient.callTool.mockResolvedValueOnce({
              content: [{ type: "text", text: "{}" }]
          });
          mockHealthClient.callTool.mockResolvedValueOnce({
              content: [{ type: "text", text: "No alerts triggered." }]
          });

          // Mock activity response
          mockBrainClient.callTool.mockResolvedValueOnce({
              content: [{ type: "text", text: "[]" }]
          });

          const status = await generator.getSystemStatus();
          const activity = await generator.getAgentActivityReport();

          const rawMessage = `*Daily Standup*\n\n*System Status:*\n${status}\n\n*Agent Activity:*\n${activity}`;
          const formatted = await formatter.format(rawMessage);

          expect(formatted).toContain("System Status:");
          expect(formatted).toContain("Agent Activity:");
          expect(formatted).toContain("😊"); // Persona check
          expect(formatted).toContain("Systems nominal");
      });
  });
});
