import React from 'react';

interface MetricsProps {
  data: any;
}

export const Metrics: React.FC<MetricsProps> = ({ data }) => {
  // Aggregate data if multiple companies or just showcase-corp
  const showcase = data ? data['showcase-corp'] : null;

  if (!showcase) {
    return (
      <div className="card">
        <h3>Live Metrics</h3>
        <p>Waiting for data...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Live Metrics (Showcase Corp)</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="metric">
          <div className="metric-value">{showcase.total_tokens || 0}</div>
          <div className="metric-label">Total Tokens</div>
        </div>
        <div className="metric">
          <div className="metric-value">${showcase.estimated_cost_usd || '0.00'}</div>
          <div className="metric-label">Est. Cost</div>
        </div>
        <div className="metric">
          <div className="metric-value">{showcase.task_count || 0}</div>
          <div className="metric-label">Tasks</div>
        </div>
        <div className="metric">
          <div className="metric-value">{showcase.success_rate || 0}%</div>
          <div className="metric-label">Success Rate</div>
        </div>
      </div>
    </div>
  );
};
