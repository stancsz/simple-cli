import React, { useRef, useEffect } from 'react';

interface LogsProps {
  logs: string[];
}

export const Logs: React.FC<LogsProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="card">
      <h3>Agent Logs</h3>
      <div className="log-viewer">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
