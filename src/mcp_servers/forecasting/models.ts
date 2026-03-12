import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as ss from 'simple-statistics';
import { MetricRecord, ForecastResult } from './types.js';

// Setup DB path
const DATA_DIR = join(process.cwd(), '.agent', 'data');
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = join(DATA_DIR, 'forecasting.db');

let db: ReturnType<typeof Database> | null = null;

export function getDb(): ReturnType<typeof Database> {
  if (!db) {
    db = new Database(DB_PATH);

    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp DATETIME NOT NULL,
        company TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_name_company ON metrics(metric_name, company);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    `);
  }
  return db;
}

// Ensure DB can be reset/closed for testing
export function _resetDb() {
    if (db) {
        db.close();
        db = null;
    }
}

export function record_metric(metric_name: string, value: number, timestamp: string, company: string): boolean {
  const database = getDb();

  // Basic validation of timestamp
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
      throw new Error("Invalid timestamp format");
  }

  const stmt = database.prepare(`
    INSERT INTO metrics (metric_name, value, timestamp, company)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(metric_name, value, date.toISOString(), company);
  return result.changes > 0;
}

export function forecast_metric(metric_name: string, horizon_days: number, company: string): ForecastResult {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT value, timestamp
    FROM metrics
    WHERE metric_name = ? AND company = ?
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all(metric_name, company) as { value: number, timestamp: string }[];

  if (rows.length < 2) {
    throw new Error(`Insufficient data to forecast ${metric_name} for company ${company}. Need at least 2 data points.`);
  }

  // Convert timestamps to days since epoch for linear regression
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const data: [number, number][] = rows.map(row => {
    const ts = new Date(row.timestamp).getTime();
    return [ts / MS_PER_DAY, row.value];
  });

  // Compute linear regression
  const regressionLine = ss.linearRegression(data);
  const predictor = ss.linearRegressionLine(regressionLine);

  // Calculate standard deviation of residuals for confidence bounds
  let standardDeviation = 0;
  if (data.length > 2) {
      const residuals = data.map(point => point[1] - predictor(point[0]));
      standardDeviation = ss.sampleStandardDeviation(residuals);
  }

  // Simple margin of error (roughly 95% confidence depending on distribution)
  const zScore = 1.96;
  const marginOfError = zScore * standardDeviation;

  const lastDate = new Date(rows[rows.length - 1].timestamp);
  const lastDateMs = lastDate.getTime();

  const forecast: ForecastResult['forecast'] = [];

  for (let i = 1; i <= horizon_days; i++) {
      const futureDateMs = lastDateMs + (i * MS_PER_DAY);
      const futureDateDays = futureDateMs / MS_PER_DAY;

      let predictedValue = predictor(futureDateDays);
      // For resource constraints we might want to ensure it doesn't drop below 0
      if (metric_name.toLowerCase().includes('cost') || metric_name.toLowerCase().includes('usage')) {
         predictedValue = Math.max(0, predictedValue);
      }

      // Expand margin of error slightly over time
      const expandedMargin = marginOfError * (1 + (i * 0.05));

      forecast.push({
          date: new Date(futureDateMs).toISOString(),
          predicted_value: Number(predictedValue.toFixed(4)),
          lower_bound: Number(Math.max(0, predictedValue - expandedMargin).toFixed(4)),
          upper_bound: Number((predictedValue + expandedMargin).toFixed(4))
      });
  }

  // R-squared for confidence score
  let rSquared = 0;
  try {
     rSquared = ss.rSquared(data, predictor);
  } catch (e) {
     rSquared = 0;
  }

  return {
      metric_name,
      company,
      horizon_days,
      forecast,
      model_used: "linear_regression",
      confidence_score: Number(rSquared.toFixed(4))
  };
}
