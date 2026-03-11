import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForecastingServer } from "../../src/mcp_servers/forecasting/index.js";
import { simulateScenario, generateForecastReport } from "../../src/mcp_servers/forecasting/forecasting_engine.js";

// Mock the getClient method directly in the module
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  return {
    Client: class MockClient {
      constructor() {}
      async connect() {}
      async close() {}
      async callTool({ name, arguments: args }: any) {
        if (name === "read_strategy") {
          return {
            content: [{
              text: JSON.stringify({
                vision: "Become the premier global AI agency",
                objectives: ["Expand market share", "Increase margins"]
              })
            }]
          };
        }
        if (name === "analyze_performance_metrics") {
          return {
            content: [{
              text: JSON.stringify({
                monthlyRevenue: [10000, 15000, 20000],
                monthlyCosts: [5000, 7500, 10000]
              })
            }]
          };
        }
        return { isError: true };
      }
    }
  };
});

// Mock the LLM explicitly so we don't have to deal with missing API keys
vi.mock("../../src/llm/index.js", () => {
  return {
    createLLM: vi.fn().mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        message: "This is a mocked narrative forecast report. Strategic Recommendation: Proceed with the plan."
      })
    }))
  };
});

describe("Phase 29: Advanced Planning & Forecasting Validation", () => {
  let server: ForecastingServer;

  beforeEach(() => {
    server = new ForecastingServer();
  });

  it("should initialize the forecasting MCP server", () => {
    expect(server).toBeDefined();
    // Use the public API to verify tools if possible, or cast to access internal for tests
    const tools = (server.getServer() as any)._registeredTools || (server.getServer() as any).registeredTools || (server.getServer() as any).tools;
    expect(tools).toHaveProperty("simulate_scenario");
    expect(tools).toHaveProperty("generate_forecast_report");
  });

  it("should simulate scenario correctly returning projected arrays", async () => {
    const result = await simulateScenario({
      pricingMultiplier: 1.1,
      marketDemandMultiplier: 1.05,
      newServiceMultiplier: 1.2,
      costMultiplier: 1.0,
      monthsToForecast: 3,
      company: "test-corp"
    });

    expect(result).toBeDefined();
    expect(result.strategy.vision).toBe("Become the premier global AI agency");
    expect(result.historicalMetrics.monthlyRevenue).toHaveLength(3);

    expect(result.forecast).toBeInstanceOf(Array);
    expect(result.forecast).toHaveLength(3);

    // Check projection values
    expect(result.forecast[0]).toHaveProperty("month", 1);
    expect(result.forecast[0]).toHaveProperty("revenue");
    expect(result.forecast[0]).toHaveProperty("cost");
    expect(result.forecast[0]).toHaveProperty("margin");

    expect(result.summary).toHaveProperty("totalRevenue");
    expect(result.summary.totalRevenue).toBeGreaterThan(0);
    expect(result.summary).toHaveProperty("totalCost");
  });

  it("should generate a narrative forecast report using the LLM", async () => {
    // We generate a dummy simulation result first
    const mockSimulationResult = {
      params: {
        pricingMultiplier: 1.1,
        marketDemandMultiplier: 1.05,
        newServiceMultiplier: 1.2,
        costMultiplier: 1.0,
        monthsToForecast: 3,
        company: "test-corp"
      },
      strategy: {
        vision: "Mock Vision",
        objectives: []
      },
      historicalMetrics: {
        monthlyRevenue: [100],
        monthlyCosts: [50]
      },
      forecast: [
        { month: 1, revenue: 150, cost: 50, margin: 0.66 }
      ],
      summary: {
        totalRevenue: 150,
        totalCost: 50,
        averageMargin: 0.66
      }
    };

    const report = await generateForecastReport(mockSimulationResult, "test-corp");

    expect(typeof report).toBe("string");
    expect(report).toContain("mocked narrative forecast report");
    expect(report).toContain("Strategic Recommendation");
  });
});