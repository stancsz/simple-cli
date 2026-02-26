import React from 'react';

export const FinancialKPIPanel: React.FC = () => {
    const [financials, setFinancials] = React.useState<any>(null);

    React.useEffect(() => {
        fetch('/api/agency/financial')
            .then(res => res.json())
            .then(data => setFinancials(data))
            .catch(err => console.error("Failed to fetch financials:", err));
    }, []);

    return (
        <div className="p-4 border rounded shadow-sm bg-white">
            <h2 className="text-xl font-bold mb-4">Financial KPIs</h2>
            {financials ? (
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 rounded">
                        <h3 className="text-sm text-gray-500">Revenue</h3>
                        <p className="text-2xl font-bold">${financials.revenue || 0}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded">
                        <h3 className="text-sm text-gray-500">Expenses</h3>
                        <p className="text-2xl font-bold">${financials.expenses || 0}</p>
                    </div>
                    {financials.message && (
                        <div className="col-span-2 text-sm text-gray-500 italic">
                            {financials.message}
                        </div>
                    )}
                </div>
            ) : (
                <p>Loading financials...</p>
            )}
        </div>
    );
};
