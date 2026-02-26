import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { getLinearClient } from "../linear_service.js";
import { getHubSpotClient } from "../crm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

// Types
interface FinancialHealth {
    revenue: number;
    profit: number;
    margin: number;
    expenses: number;
}

interface OperationalEfficiency {
    velocity: number; // Issues completed per week
    backlogAgeDays: number; // Avg age of open issues
    completionRate: number; // Completed / (Completed + Open)
    efficiencyScore: number; // 0-100
}

interface ClientSatisfaction {
    npsScore: number;
    satisfactionScore: number; // 0-10
    activeClients: number;
}

interface PerformanceReport {
    timeframe: string;
    clientId?: string;
    financial: FinancialHealth;
    operational: OperationalEfficiency;
    client: ClientSatisfaction;
    overallHealthScore: number; // 0-100
    timestamp: string;
}

// Helpers
async function getFinancialMetrics(timeframe: string, tenantId: string): Promise<FinancialHealth> {
    const xero = await getXeroClient();
    const now = new Date();
    let fromDate: Date;

    if (timeframe === 'last_quarter') {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else { // last_month
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    const toDateStr = now.toISOString().split('T')[0];
    const fromDateStr = fromDate.toISOString().split('T')[0];

    try {
        // Try to get P&L
        const response = await xero.accountingApi.getReportProfitAndLoss(
            tenantId,
            fromDateStr,
            toDateStr
        );

        // Parse P&L - this is complex as Xero returns a report structure.
        // For MVP/Robustness, we might fallback to Invoice summation if P&L parsing is too fragile without strict types.
        // However, let's try to extract Total Income and Net Profit if available in the standard report rows.

        // Simplified approach: Sum authorized invoices for Revenue, and approximate expenses.
        // If P&L fails or is empty, we use invoices.

        // Actually, let's stick to the plan: Query Invoices for Revenue, simplified Profit.
        // Getting P&L is better but requires traversing the Report rows.
        // Let's try to use P&L if we can traverse it, otherwise fallback.

        // Validating via Xero API types is hard without seeing the exact response shape in this env.
        // Let's use Invoices for Revenue as it's more deterministic in previous tools.

        // @ts-ignore
        const invoices = await xero.accountingApi.getInvoices(tenantId, undefined, 'Status=="AUTHORISED"');
        let revenue = 0;
        if (invoices.body.invoices) {
            // Filter by date
            const relevantInvoices = invoices.body.invoices.filter((inv: any) => {
                 const date = new Date(inv.date || '');
                 return date >= fromDate && date <= now;
            });
            revenue = relevantInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
        }

        // Approximate profit margin (e.g. 30% for simulation if expense data is hard to aggregate quickly)
        // Or query Bills (Accounts Payable)
        let expenses = 0;
        try {
             // @ts-ignore
            const bills = await xero.accountingApi.getInvoices(tenantId, undefined, 'Type=="ACCPAY" AND Status=="AUTHORISED"');
            if (bills.body.invoices) {
                 const relevantBills = bills.body.invoices.filter((inv: any) => {
                     const date = new Date(inv.date || '');
                     return date >= fromDate && date <= now;
                 });
                 expenses = relevantBills.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
            }
        } catch (e) {
            console.warn("Failed to fetch bills", e);
        }

        const profit = revenue - expenses;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        return { revenue, profit, margin, expenses };

    } catch (e) {
        console.error("Xero Metrics Failed:", e);
        return { revenue: 0, profit: 0, margin: 0, expenses: 0 };
    }
}

async function getOperationalMetrics(timeframe: string, clientId?: string): Promise<OperationalEfficiency> {
    const linear = getLinearClient();
    const now = new Date();
    let fromDate: Date;

    if (timeframe === 'last_quarter') {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else { // last_month
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    try {
        // Fetch issues.
        // Filter: If clientId is provided, we might need to filter by project name or description.
        // For now, if clientId is provided, we assume it matches a Project Name.

        let filter: any = {
             updatedAt: { gt: fromDate }
        };

        if (clientId) {
            // Try to find project
            const projects = await linear.projects({ filter: { name: { contains: clientId } } });
            if (projects.nodes.length > 0) {
                filter = { project: { id: { eq: projects.nodes[0].id } }, updatedAt: { gt: fromDate } };
            }
        }

        const issues = await linear.issues({ filter });

        let completed = 0;
        let open = 0;
        let totalBacklogAge = 0;

        const nodes = issues.nodes;
        for (const issue of nodes) {
            const state = await issue.state;
            if (state?.type === 'completed') {
                if (issue.completedAt && issue.completedAt >= fromDate) {
                    completed++;
                }
            } else if (state?.type !== 'canceled') {
                open++;
                const created = new Date(issue.createdAt);
                const ageDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
                totalBacklogAge += ageDays;
            }
        }

        const weeks = (now.getTime() - fromDate.getTime()) / (1000 * 3600 * 24 * 7);
        const velocity = completed / weeks;
        const backlogAgeDays = open > 0 ? totalBacklogAge / open : 0;
        const completionRate = (completed + open) > 0 ? (completed / (completed + open)) * 100 : 0;

        // Efficiency Score Calculation (Heuristic)
        // High velocity, low backlog age, high completion rate = good.
        let efficiencyScore = 50; // Base
        efficiencyScore += (completionRate * 0.5); // Up to 50
        if (backlogAgeDays < 7) efficiencyScore += 10;
        if (backlogAgeDays > 30) efficiencyScore -= 10;
        efficiencyScore = Math.min(100, Math.max(0, efficiencyScore));

        return { velocity, backlogAgeDays, completionRate, efficiencyScore };

    } catch (e) {
        console.error("Linear Metrics Failed:", e);
        return { velocity: 0, backlogAgeDays: 0, completionRate: 0, efficiencyScore: 0 };
    }
}

async function getClientMetrics(timeframe: string, clientId?: string): Promise<ClientSatisfaction> {
    const hubspot = getHubSpotClient();

    try {
        let npsValues: number[] = [];
        let satValues: number[] = [];
        let activeClients = 0;

        if (clientId) {
            // Specific client
            // @ts-ignore
            const search = await hubspot.crm.companies.searchApi.doSearch({
                filterGroups: [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: clientId }] }],
                properties: ["nps_score", "client_satisfaction_score"]
            });

            if (search.results.length > 0) {
                activeClients = 1;
                const company = search.results[0];
                if (company.properties.nps_score) npsValues.push(Number(company.properties.nps_score));
                if (company.properties.client_satisfaction_score) satValues.push(Number(company.properties.client_satisfaction_score));
            }
        } else {
            // All clients
             // @ts-ignore
            const response = await hubspot.crm.companies.basicApi.getPage(100, undefined, ["nps_score", "client_satisfaction_score"]);
             // @ts-ignore
            activeClients = response.results.length;
             // @ts-ignore
            response.results.forEach((company: any) => {
                if (company.properties.nps_score) npsValues.push(Number(company.properties.nps_score));
                if (company.properties.client_satisfaction_score) satValues.push(Number(company.properties.client_satisfaction_score));
            });
        }

        const avgNps = npsValues.length > 0 ? npsValues.reduce((a, b) => a + b, 0) / npsValues.length : 0;
        const avgSat = satValues.length > 0 ? satValues.reduce((a, b) => a + b, 0) / satValues.length : 0;

        return {
            npsScore: avgNps,
            satisfactionScore: avgSat,
            activeClients
        };

    } catch (e) {
        console.error("HubSpot Metrics Failed:", e);
        // Fallback / Mock for now if properties don't exist
        return { npsScore: 0, satisfactionScore: 0, activeClients: 0 };
    }
}

export function registerPerformanceAnalyticsTools(server: McpServer) {
    server.tool(
        "analyze_performance_metrics",
        "Aggregates business KPIs from Xero, Linear, and HubSpot.",
        {
            timeframe: z.enum(["last_month", "last_quarter"]).describe("Time period for analysis."),
            client_id: z.string().optional().describe("Optional: Analyze specific client.")
        },
        async ({ timeframe, client_id }) => {
            // 1. Fetch Metrics in Parallel
            let tenantId = "";
            try {
                const xero = await getXeroClient();
                tenantId = await getTenantId(xero);
            } catch (e) {
                console.warn("Xero not available, skipping financial metrics.");
            }

            const [financial, operational, client] = await Promise.all([
                tenantId ? getFinancialMetrics(timeframe, tenantId) : Promise.resolve({ revenue: 0, profit: 0, margin: 0, expenses: 0 }),
                getOperationalMetrics(timeframe, client_id),
                getClientMetrics(timeframe, client_id)
            ]);

            // 2. Calculate Overall Score
            // Weighted average: 40% Financial, 30% Operational, 30% Client
            // Normalize financial: Margin > 20% = 100, < 0% = 0
            const marginScore = Math.min(100, Math.max(0, (financial.margin / 20) * 100));
            const operationalScore = operational.efficiencyScore;
            const clientScore = Math.min(100, (client.satisfactionScore / 10) * 100) || (client.npsScore + 100) / 2 || 50; // Fallback to 50 if no data

            const overallHealthScore = Math.round(
                (marginScore * 0.4) +
                (operationalScore * 0.3) +
                (clientScore * 0.3)
            );

            const report: PerformanceReport = {
                timeframe,
                clientId: client_id,
                financial,
                operational,
                client,
                overallHealthScore,
                timestamp: new Date().toISOString()
            };

            // 3. Store in Brain
            try {
                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    `performance_audit_${timeframe}_${Date.now()}`,
                    `Performance Audit for ${client_id || 'Agency'}`,
                    JSON.stringify(report),
                    [],
                    undefined,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0,
                    0,
                    "performance_audit"
                );
            } catch (e) {
                console.warn("Failed to store audit in Brain:", e);
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(report, null, 2)
                }]
            };
        }
    );
}
