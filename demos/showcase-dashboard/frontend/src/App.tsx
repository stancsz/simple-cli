import { useState, useEffect } from 'react';
import { Metrics } from './components/Metrics';
import { Logs } from './components/Logs';
import { Pillars } from './components/Pillars';
import { Play, Loader2 } from 'lucide-react';

interface Status {
  [key: string]: 'pending' | 'active' | 'completed';
  context: 'pending' | 'active' | 'completed';
  sop: 'pending' | 'active' | 'completed';
  ghost: 'pending' | 'active' | 'completed';
  hr: 'pending' | 'active' | 'completed';
}

function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [status, setStatus] = useState<Status>({
    context: 'pending',
    sop: 'pending',
    ghost: 'pending',
    hr: 'pending',
  });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // SSE for Logs
    const evtSource = new EventSource('/api/logs');

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const msg = data.message;
      setLogs((prev) => [...prev, msg]);

      // Parse status
      if (msg.includes('--- Pillar 1: Company Context ---')) {
        setStatus(prev => ({ ...prev, context: 'active' }));
      }
      if (msg.includes('--- Pillar 2: SOP-as-Code ---')) {
        setStatus(prev => ({ ...prev, context: 'completed', sop: 'active' }));
      }
      if (msg.includes('--- Pillar 3: Ghost Mode (Time Lapse) ---')) {
        setStatus(prev => ({ ...prev, sop: 'completed', ghost: 'active' }));
      }
      if (msg.includes('--- Pillar 4: HR Loop (Self-Optimization) ---')) {
        setStatus(prev => ({ ...prev, ghost: 'completed', hr: 'active' }));
      }
      if (msg.includes('✅ Showcase Simulation Complete!')) {
        setStatus(prev => ({ ...prev, hr: 'completed' }));
        setIsRunning(false);
      }
    };

    return () => {
      evtSource.close();
    };
  }, []);

  useEffect(() => {
    // Poll Metrics
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/metrics');
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (e) {
        // ignore errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const startDemo = async () => {
    setIsRunning(true);
    // Reset status
    setStatus({
      context: 'pending',
      sop: 'pending',
      ghost: 'pending',
      hr: 'pending',
    });
    setLogs([]); // Clear logs on restart? Or append? User probably wants fresh logs.
    // Actually keep logs but maybe clear old ones if re-running?
    // Let's clear logs for a fresh run visualization.

    try {
      const res = await fetch('/api/trigger-demo');
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to start demo: ${err.message}`);
        setIsRunning(false);
      }
    } catch (e) {
      alert("Failed to trigger demo API");
      setIsRunning(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🚀 Production Showcase Dashboard</h1>
        <button className="btn" onClick={startDemo} disabled={isRunning}>
          {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
          {isRunning ? 'Running Simulation...' : 'Start Live Demo'}
        </button>
      </div>

      <div className="grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Pillars status={status} />
          <Metrics data={metrics} />

          {status.hr === 'completed' && (
             <div className="card" style={{ background: '#ecfdf5', borderColor: '#059669' }}>
               <h3>🎉 Simulation Complete</h3>
               <p>The Digital Agency has successfully completed the project lifecycle.</p>
               <ul>
                 <li>Context Loaded & Verified</li>
                 <li>SOP Executed (Project Scaffolding)</li>
                 <li>Ghost Mode simulated 24h of work</li>
                 <li>HR Loop optimized agent performance</li>
               </ul>
             </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <Logs logs={logs} />
        </div>
      </div>
    </div>
  );
}

export default App;
