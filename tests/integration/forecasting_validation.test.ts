import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForecastingServer } from "../../src/mcp_servers/forecasting/index.js";
import { simulateScenario, generateForecastReport } from "../../src/mcp_servers/forecasting/forecasting_engine.js";
import { record_metric, forecast_metric, getDb, _resetDb } from "../../src/mcp_servers/forecasting/models.js";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

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
    expect(tools).toHaveProperty("record_metric");
    expect(tools).toHaveProperty("forecast_metric");
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

describe("Phase 29: Time-Series Forecasting Tools Validation", () => {
  const testCompany = "test-tenant-1";
  const testMetric = "api_costs";

  beforeEach(() => {
    _resetDb();
    const dbPath = join(process.cwd(), '.agent', 'data', 'forecasting.db');
    if (existsSync(dbPath)) {
       unlinkSync(dbPath);
    }
  });

  it("should record metric data correctly into SQLite DB", () => {
    const success = record_metric(testMetric, 100.5, new Date().toISOString(), testCompany);
    expect(success).toBe(true);

    const db = getDb();
    const row = db.prepare("SELECT * FROM metrics WHERE metric_name = ? AND company = ?").get(testMetric, testCompany) as any;

    expect(row).toBeDefined();
    expect(row.value).toBe(100.5);
    expect(row.company).toBe(testCompany);
    expect(row.metric_name).toBe(testMetric);
  });

  it("should throw error when forecasting with less than 2 data points", () => {
    record_metric(testMetric, 100, new Date().toISOString(), testCompany);
    expect(() => forecast_metric(testMetric, 7, testCompany)).toThrow(/Insufficient data/);
  });

  it("should forecast metric using simple-statistics linear regression", () => {
    const baseDateMs = new Date("2023-01-01T00:00:00Z").getTime();
    const msPerDay = 1000 * 60 * 60 * 24;

    // Create a predictable linear trend: y = 10x + 100
    for (let i = 0; i < 5; i++) {
        record_metric(testMetric, 100 + (10 * i), new Date(baseDateMs + (i * msPerDay)).toISOString(), testCompany);
    }

    const horizon = 3;
    const result = forecast_metric(testMetric, horizon, testCompany);

    expect(result.metric_name).toBe(testMetric);
    expect(result.company).toBe(testCompany);
    expect(result.horizon_days).toBe(horizon);
    expect(result.forecast).toHaveLength(horizon);
    expect(result.model_used).toBe("linear_regression");

    // The last point was day 4 (index 4) with value 140.
    // Predict day 5: 150, day 6: 160, day 7: 170.
    expect(Math.round(result.forecast[0].predicted_value)).toBe(150);
    expect(Math.round(result.forecast[1].predicted_value)).toBe(160);
    expect(Math.round(result.forecast[2].predicted_value)).toBe(170);

    // Confidence bound expansion
    expect(result.forecast[1].upper_bound).toBeGreaterThanOrEqual(result.forecast[0].upper_bound as number);
  });

  it("should maintain multi-tenant isolation by company", () => {
     const baseDateMs = new Date("2023-01-01T00:00:00Z").getTime();
     const msPerDay = 1000 * 60 * 60 * 24;

     // Company A has increasing cost: y = 10x + 100
     for (let i = 0; i < 5; i++) {
         record_metric(testMetric, 100 + (10 * i), new Date(baseDateMs + (i * msPerDay)).toISOString(), "CompanyA");
     }

     // Company B has flat cost: y = 50
     for (let i = 0; i < 5; i++) {
         record_metric(testMetric, 50, new Date(baseDateMs + (i * msPerDay)).toISOString(), "CompanyB");
     }

     const resultA = forecast_metric(testMetric, 1, "CompanyA");
     const resultB = forecast_metric(testMetric, 1, "CompanyB");

     expect(Math.round(resultA.forecast[0].predicted_value)).toBe(150);
     expect(Math.round(resultB.forecast[0].predicted_value)).toBe(50);
  });
});