export interface CompanyMetrics {
  total_tokens: number;
  avg_duration_ms: number;
  success_rate: number;
  task_count: number;
  estimated_cost_usd: number;
  pillars: {
    sop: { score: number, metrics: any };
    ghost: { score: number, metrics: any };
    hr: { score: number, metrics: any };
    context: { score: number, metrics: any };
  };
}

export async function fetchMetrics(): Promise<Record<string, CompanyMetrics>> {
  const res = await fetch('/api/dashboard/metrics');
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export async function fetchAlerts(): Promise<string[]> {
  const res = await fetch('/api/dashboard/alerts');
  if (!res.ok) throw new Error('Failed to fetch alerts');
  const data = await res.json();
  return data.alerts || [];
}

export async function fetchSummary(): Promise<string> {
  const res = await fetch('/api/dashboard/summary');
  if (!res.ok) throw new Error('Failed to fetch summary');
  const data = await res.json();
  return data.summary || 'Summary unavailable.';
}
