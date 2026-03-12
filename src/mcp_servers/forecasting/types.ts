export interface MetricRecord {
  id?: number;
  metric_name: string;
  value: number;
  timestamp: string;
  company: string;
}

export interface ForecastResult {
  metric_name: string;
  company: string;
  horizon_days: number;
  forecast: Array<{
    date: string;
    predicted_value: number;
    lower_bound?: number;
    upper_bound?: number;
  }>;
  model_used: string;
  confidence_score?: number;
}
