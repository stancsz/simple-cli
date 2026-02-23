export type MetricPillar = 'sop' | 'ghost' | 'hr' | 'context';

export interface BaseMetric {
  timestamp: string; // ISO 8601
  company: string;
  pillar: MetricPillar;
  metric: string;
  value: number;
  tags?: Record<string, string>;
}

export interface SopMetrics {
  sop_execution_success_rate: number;
  sop_execution_time: number;
  sop_retry_count: number;
}

export interface GhostMetrics {
  ghost_task_completion_rate: number;
  scheduled_task_count: number;
  autonomous_hours: number;
}

export interface HrMetrics {
  hr_proposals_generated: number;
  core_updates_applied: number;
  dreaming_resolutions: number;
}

export interface ContextMetrics {
  context_queries: number;
  brain_memory_usage: number;
  company_switch_count: number;
}

export interface CompanyPillarHealth {
  sop: { score: number; metrics: Partial<SopMetrics> };
  ghost: { score: number; metrics: Partial<GhostMetrics> };
  hr: { score: number; metrics: Partial<HrMetrics> };
  context: { score: number; metrics: Partial<ContextMetrics> };
}

export interface AggregatedCompanyMetrics {
  company: string;
  overall_health_score: number;
  pillars: CompanyPillarHealth;
  last_updated: string;
}
