import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { getLinearClient } from "../linear_service.js";
import { getHubSpotClient } from "../crm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

interface PerformanceMetrics {
    period: string;
    financial: {
        revenue: number;
        outstanding: number;
        profit_margin_proxy: number; // (Revenue - Outstanding) / Revenue
    };
    efficiency: {
        completion_rate: number;
        average_cycle_time_days: number;
        backlog_size: number;
    };
    satisfaction: {
        deal_win_rate: number;
        ticket_volume: number; // Placeholder for support volume
        nps_score: number; // Placeholder/Mock
    };
    overall_health_score: number; // 0-100
    timestamp: string;
}

export function registerPerformanceAnalyticsTools(server: McpServer) {
    server.tool(
        "analyze_performance_metrics",
        "Aggregates agency performance metrics from Xero (Financial), Linear (Efficiency), and HubSpot (Satisfaction) for the specified period.",
        {
            period: z.enum(["last_30_days"]).default("last_30_days").describe("Time period for analysis.")
        },
        async ({ period }) => {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 30);

            const metrics: PerformanceMetrics = {
                period,
                financial: { revenue: 0, outstanding: 0, profit_margin_proxy: 0 },
                efficiency: { completion_rate: 0, average_cycle_time_days: 0, backlog_size: 0 },
                satisfaction: { deal_win_rate: 0, ticket_volume: 0, nps_score: 0 },
                overall_health_score: 0,
                timestamp: new Date().toISOString()
            };

            const errors: string[] = [];

            // 1. Xero: Financial Metrics
            try {
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                // Fetch invoices updated in the last 30 days
                // Note: Xero API filtering can be tricky, fetching recent and filtering in memory for simplicity in this MVP
                const response = await xero.accountingApi.getInvoices(
                    tenantId,
                    startDate, // updatedAfter
                    undefined, // where
                    undefined, // order
                    undefined, // ids
                    undefined, // invoiceNumbers
                    undefined, // contactIDs
                    ["AUTHORISED", "PAID"], // statuses
                    1, // page
                    false, // includeArchived
                    false, // createdByMyApp
                    true // unitdp
                );

                if (response.body.invoices) {
                    const invoices = response.body.invoices;
                    metrics.financial.revenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                    metrics.financial.outstanding = invoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);

                    if (metrics.financial.revenue > 0) {
                        metrics.financial.profit_margin_proxy = (metrics.financial.revenue - metrics.financial.outstanding) / metrics.financial.revenue;
                    }
                }
            } catch (e: any) {
                console.error("Xero metrics failed:", e);
                errors.push(`Xero: ${e.message}`);
            }

            // 2. Linear: Efficiency Metrics
            try {
                const linear = getLinearClient();

                // Fetch issues updated in last 30 days
                const issues = await linear.issues({
                    filter: {
                        updatedAt: { gt: startDate }
                    }
                });

                let completedCount = 0;
                let totalCycleTime = 0;
                let backlogCount = 0;
                let totalIssues = 0;

                if (issues.nodes.length > 0) {
                    for (const issue of issues.nodes) {
                        totalIssues++;
                        const state = await issue.state;

                        if (state?.type === "completed" || state?.name === "Done" || state?.name === "Canceled") {
                            completedCount++;
                            // Simple cycle time approximation: completedAt - createdAt
                            if (issue.completedAt && issue.createdAt) {
                                const cycleTimeMs = issue.completedAt.getTime() - issue.createdAt.getTime();
                                totalCycleTime += cycleTimeMs / (1000 * 60 * 60 * 24); // Convert to days
                            }
                        } else if (state?.type === "backlog" || state?.type === "started" || state?.type === "unstarted") {
                            backlogCount++;
                        }
                    }

                    metrics.efficiency.completion_rate = totalIssues > 0 ? completedCount / totalIssues : 0;
                    metrics.efficiency.average_cycle_time_days = completedCount > 0 ? totalCycleTime / completedCount : 0;
                    metrics.efficiency.backlog_size = backlogCount;
                }
            } catch (e: any) {
                console.error("Linear metrics failed:", e);
                errors.push(`Linear: ${e.message}`);
            }

            // 3. HubSpot: Satisfaction Metrics
            try {
                const hubspot = getHubSpotClient();

                // Search for deals closed in the last 30 days
                const dealSearchRequest = {
                    filterGroups: [
                        {
                            filters: [
                                {
                                    propertyName: "closedate",
                                    operator: "GTE",
                                    value: startDate.getTime().toString()
                                }
                            ]
                        }
                    ],
                    properties: ["dealstage", "closedate"],
                    limit: 100
                };

                // @ts-ignore
                const dealResults = await hubspot.crm.deals.searchApi.doSearch(dealSearchRequest);

                let wonDeals = 0;
                let closedDeals = 0;

                if (dealResults.results.length > 0) {
                    for (const deal of dealResults.results) {
                        closedDeals++;
                        // Assuming 'closedwon' is the internal ID for won deals. Adjust if pipeline is custom.
                        if (deal.properties.dealstage === "closedwon") {
                            wonDeals++;
                        }
                    }
                    metrics.satisfaction.deal_win_rate = closedDeals > 0 ? wonDeals / closedDeals : 0;
                }

                // Mock NPS and Ticket Volume for now as they require specific Hubs (Service Hub)
                metrics.satisfaction.nps_score = 75; // Baseline
                metrics.satisfaction.ticket_volume = 12; // Baseline

            } catch (e: any) {
                console.error("HubSpot metrics failed:", e);
                errors.push(`HubSpot: ${e.message}`);
            }

            // 4. Calculate Overall Health Score
            // Weights: Financial 40%, Efficiency 30%, Satisfaction 30%
            // Normalization is tricky without targets. We'll use simple heuristics.

            const financialScore = Math.min(metrics.financial.profit_margin_proxy * 100, 100); // 100% collection = 100 score

            // Efficiency: 80% completion = 100 score? Let's say completion rate * 100.
            const efficiencyScore = Math.min(metrics.efficiency.completion_rate * 100, 100);

            // Satisfaction: Win rate * 100
            const satisfactionScore = Math.min(metrics.satisfaction.deal_win_rate * 100, 100);

            metrics.overall_health_score = Math.round(
                (financialScore * 0.4) +
                (efficiencyScore * 0.3) +
                (satisfactionScore * 0.3)
            );

            // 5. Store in Brain
            try {
                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    `performance_snapshot_${period}_${new Date().toISOString()}`,
                    "Agenc Performance Snapshot",
                    JSON.stringify(metrics),
                    [],
                    undefined,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0,
                    0,
                    "performance_metric"
                );
            } catch (e) {
                console.warn("Failed to store metrics in Brain", e);
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ metrics, errors }, null, 2)
                }]
            };
        }
    );
}
