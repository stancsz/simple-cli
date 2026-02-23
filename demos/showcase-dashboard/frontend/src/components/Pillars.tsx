import React from 'react';
import { CheckCircle, Loader2, Circle } from 'lucide-react';

interface PillarsProps {
  status: {
    context: 'pending' | 'active' | 'completed';
    sop: 'pending' | 'active' | 'completed';
    ghost: 'pending' | 'active' | 'completed';
    hr: 'pending' | 'active' | 'completed';
    [key: string]: 'pending' | 'active' | 'completed'; // Allow indexing
  };
}

export const Pillars: React.FC<PillarsProps> = ({ status }) => {
  const pillars = [
    { id: 'context', title: '1. Company Context', desc: 'Ingesting knowledge base & brand voice' },
    { id: 'sop', title: '2. SOP-as-Code', desc: 'Executing deterministic workflow' },
    { id: 'ghost', title: '3. Ghost Mode', desc: 'Simulating time-lapsed cron jobs' },
    { id: 'hr', title: '4. HR Loop', desc: 'Self-optimization & performance review' }
  ];

  return (
    <div className="card">
      <h3>Pillar Execution Status</h3>
      <div>
        {pillars.map((p) => {
          const s = status[p.id];
          return (
            <div key={p.id} className={`status-step ${s}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {s === 'completed' && <CheckCircle color="green" size={20} />}
                {s === 'active' && <Loader2 className="animate-spin" color="blue" size={20} />}
                {s === 'pending' && <Circle color="gray" size={20} />}
                <div>
                  <strong>{p.title}</strong>
                  <div style={{ fontSize: '0.8em', color: '#666' }}>{p.desc}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
