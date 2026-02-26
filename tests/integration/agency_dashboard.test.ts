import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDashboardServer } from '../../src/mcp_servers/agency_dashboard/dashboard_server.js';
import { DataAggregator } from '../../src/mcp_servers/agency_dashboard/data_aggregator.js';

// Mock DataAggregator
vi.mock('../../src/mcp_servers/agency_dashboard/data_aggregator.js', () => {
    return {
        DataAggregator: vi.fn().mockImplementation(() => ({
            getSwarmFleetStatus: vi.fn().mockResolvedValue({ swarms: [], status: 'ok' }),
            getFinancialKPIs: vi.fn().mockResolvedValue({ revenue: 1000, expenses: 500 }),
            getSystemHealth: vi.fn().mockResolvedValue({ uptime: 100, status: 'healthy' }),
            getClientHealth: vi.fn().mockResolvedValue({ clients: [], risk: 'low' }),
            connectToBusinessOps: vi.fn(),
            connectToHealthMonitor: vi.fn(),
        }))
    };
});

describe('Agency Dashboard Integration', () => {
    let server: any;

    beforeEach(async () => {
        // Use a random port for testing
        // Note: We use a port > 1024 to avoid permission issues
        server = await createDashboardServer(30022);
    });

    afterEach((done) => {
        server.close(done);
    });

    it('should serve the dashboard UI (or fallback)', async () => {
        const response = await request(server).get('/');
        expect(response.status).toBe(200);
        // It might serve index.html from dist_agency or the fallback text
        // "Agency Dashboard is running..."
        expect(response.text).toMatch(/Agency Dashboard|<!DOCTYPE html>/);
    });

    it('should return fleet status', async () => {
        const response = await request(server).get('/api/agency/fleet');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ swarms: [], status: 'ok' });
    });

    it('should return financial KPIs', async () => {
        const response = await request(server).get('/api/agency/financial');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ revenue: 1000, expenses: 500 });
    });

    it('should return system health', async () => {
        const response = await request(server).get('/api/agency/system-health');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ uptime: 100, status: 'healthy' });
    });

    it('should return client health', async () => {
        const response = await request(server).get('/api/agency/client-health');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ clients: [], risk: 'low' });
    });
});
