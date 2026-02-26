import React from 'react';

export const ClientHealthPanel: React.FC = () => {
    const [clientHealth, setClientHealth] = React.useState<any>(null);

    React.useEffect(() => {
        fetch('/api/agency/client-health')
            .then(res => res.json())
            .then(data => setClientHealth(data))
            .catch(err => console.error("Failed to fetch client health:", err));
    }, []);

    return (
        <div className="p-4 border rounded shadow-sm bg-white">
            <h2 className="text-xl font-bold mb-4">Client Health Risk</h2>
             {clientHealth ? (
                <div>
                     {clientHealth.clients && clientHealth.clients.length > 0 ? (
                        <table className="min-w-full text-left text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2">Client</th>
                                    <th className="py-2">Risk Score</th>
                                    <th className="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientHealth.clients.map((client: any, idx: number) => (
                                    <tr key={idx} className="border-b">
                                        <td className="py-2">{client.name || 'Unknown'}</td>
                                        <td className="py-2">
                                            <span className={`font-bold ${client.riskScore > 50 ? 'text-red-600' : 'text-green-600'}`}>
                                                {client.riskScore || '-'}
                                            </span>
                                        </td>
                                        <td className="py-2">{client.status || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     ) : (
                         <div className="text-gray-500">
                             {clientHealth.message || "No client health data available."}
                         </div>
                     )}
                     {clientHealth.error && <div className="text-red-500 mt-2">{clientHealth.error}</div>}
                </div>
            ) : (
                <p>Loading client health...</p>
            )}
        </div>
    );
};
