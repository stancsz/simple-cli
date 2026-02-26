import React from 'react';
import { SwarmFleetPanel } from './ui/swarm_fleet_panel';
import { FinancialKPIPanel } from './ui/financial_kpi_panel';
import { ClientHealthPanel } from './ui/client_health_panel';
import { SystemHealthPanel } from './ui/system_health_panel';

const App: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Agency Dashboard</h1>
                <p className="text-gray-600">Unified Operational View (Phase 23)</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <SwarmFleetPanel />
                <FinancialKPIPanel />
                <ClientHealthPanel />
                <SystemHealthPanel />
            </div>
        </div>
    );
};

export default App;
