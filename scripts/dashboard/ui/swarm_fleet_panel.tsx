import React from 'react';

export const SwarmFleetPanel: React.FC = () => {
    const [fleetStatus, setFleetStatus] = React.useState<any>(null);

    React.useEffect(() => {
        fetch('/api/agency/fleet')
            .then(res => res.json())
            .then(data => setFleetStatus(data))
            .catch(err => console.error("Failed to fetch fleet status:", err));
    }, []);

    return (
        <div className="p-4 border rounded shadow-sm bg-white">
            <h2 className="text-xl font-bold mb-4">Swarm Fleet Status</h2>
            {fleetStatus ? (
                <div>
                     {fleetStatus.swarms && fleetStatus.swarms.length > 0 ? (
                        <table className="min-w-full text-left text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2">Swarm Name</th>
                                    <th className="py-2">Status</th>
                                    <th className="py-2">Utilization</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fleetStatus.swarms.map((swarm: any, idx: number) => (
                                    <tr key={idx} className="border-b">
                                        <td className="py-2">{swarm.name || 'Unknown'}</td>
                                        <td className="py-2">
                                            <span className={`px-2 py-1 rounded text-xs ${swarm.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {swarm.status || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="py-2">{swarm.utilization ? `${swarm.utilization}%` : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     ) : (
                         <div className="text-gray-500">No active swarms found.</div>
                     )}
                     {fleetStatus.error && <div className="text-red-500 mt-2">{fleetStatus.error}</div>}
                </div>
            ) : (
                <p>Loading fleet status...</p>
            )}
        </div>
    );
};
