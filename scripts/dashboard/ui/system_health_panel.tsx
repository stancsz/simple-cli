import React from 'react';

export const SystemHealthPanel: React.FC = () => {
    const [systemHealth, setSystemHealth] = React.useState<any>(null);

    React.useEffect(() => {
        fetch('/api/agency/system-health')
            .then(res => res.json())
            .then(data => setSystemHealth(data))
            .catch(err => console.error("Failed to fetch system health:", err));
    }, []);

    return (
        <div className="p-4 border rounded shadow-sm bg-white">
            <h2 className="text-xl font-bold mb-4">System Health</h2>
            {systemHealth ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                         <span className="text-gray-600">Status</span>
                         <span className={`font-bold ${systemHealth.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
                             {systemHealth.status || 'Unknown'}
                         </span>
                    </div>
                    {systemHealth.uptime && (
                        <div className="flex items-center justify-between">
                             <span className="text-gray-600">Uptime</span>
                             <span className="font-mono">{systemHealth.uptime}s</span>
                        </div>
                    )}
                    {/* Render aggregation report if available */}
                    {Object.keys(systemHealth).length > 2 && (
                         <div className="mt-4">
                             <h3 className="font-semibold mb-2">Metrics</h3>
                             <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                                 {JSON.stringify(systemHealth, null, 2)}
                             </pre>
                         </div>
                    )}
                </div>
            ) : (
                <p>Loading system health...</p>
            )}
        </div>
    );
};
