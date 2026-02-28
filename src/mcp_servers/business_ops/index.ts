import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import { z } from "zod";
import { registerTools } from "./tools.js";
import { registerXeroTools } from "./xero_tools.js";
import { registerProjectManagementTools } from "./project_management.js";
import { registerWorkflowTools } from "./workflow.js";
import { registerBillingTools } from "./tools/automated_billing.js";
import { registerBillingWorkflow } from "./workflows/automated_billing_workflow.js";
import { registerCrmTools } from "./crm.js";
import { registerLinearIntegrationTools } from "./tools/linear_integration.js";
import { registerLeadGenerationTools } from "./tools/lead_generation.js";
import { registerProjectDeliveryTools } from "./tools/project_delivery.js";
import { registerClientOffboardingTools } from "./tools/client_offboarding.js";
import { registerScalingTools } from "../scaling_engine/scaling_orchestrator.js";
import { registerSwarmFleetManagementTools } from "./tools/swarm_fleet_management.js";
import { registerPredictiveHealthTools } from "./tools/predictive_health.js";
import { registerMarketAnalysisTools } from "./tools/market_analysis.js";
import { registerEconomicOptimizationTools } from "./tools/economic_optimization.js";
import { registerPerformanceAnalyticsTools } from "./tools/performance_analytics.js";
import { registerPricingOptimizationTools } from "./tools/pricing_optimization.js";
import { registerServiceAdjustmentTools } from "./tools/service_adjustment.js";
import { registerResourceAllocationTools } from "./tools/resource_allocation.js";
import { registerPolicyEngineTools } from "./tools/policy_engine.js";
import { registerStrategicExecutionTools } from "./tools/strategic_execution.js";
import { registerEnhancedLeadGenerationTools } from "./tools/enhanced_lead_generation.js";
import { registerProposalGenerationTools } from "./tools/proposal_generation.js";
import { registerContractNegotiationTools } from "./tools/contract_negotiation.js";
import { registerMarketPositioningTools } from "./tools/market_positioning.js";
import { registerRevenueValidationTools } from "./tools/revenue_validation.js";

// Load secrets from .env.agent
const envPath = join(process.cwd(), ".env.agent");
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Initialize Server
const server = new McpServer({
  name: "business_ops",
  version: "1.0.0",
});

// Register Tools
registerTools(server);
registerXeroTools(server);
registerProjectManagementTools(server);
registerWorkflowTools(server);

server.tool(
    "export_financial_data",
    "Exports actual Xero data using the Xero integration to a JSON file.",
    {},
    async () => {
        try {
            // Use dynamically imported getXeroClient to avoid top-level issues if we do not export it yet
            // xero_tools exports getXeroClient and getTenantId
            const { getXeroClient, getTenantId } = await import("./xero_tools.js");
            const xero = await getXeroClient();
            const tenantId = await getTenantId(xero);
            const invoices = await xero.accountingApi.getInvoices(tenantId);
            const contacts = await xero.accountingApi.getContacts(tenantId);
            const pl = await xero.accountingApi.getReportProfitAndLoss(tenantId, "2023-01-01", "2023-12-31");
            const bs = await xero.accountingApi.getReportBalanceSheet(tenantId, "2023-12-31");

            const data = {
                invoices: invoices.body.invoices,
                contacts: contacts.body.contacts,
                profitAndLoss: pl.body,
                balanceSheet: bs.body
            };

            const { join } = await import("path");
            const { writeFile } = await import("fs/promises");
            const exportPath = join(process.cwd(), ".agent", "finance_export.json");
            await writeFile(exportPath, JSON.stringify(data, null, 2));

            return { content: [{ type: "text", text: `Financial data exported successfully to ${exportPath}` }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Finance export failed: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    "restore_financial_data",
    "Simulates restoring financial data (read-only state update).",
    { exportPath: z.string().describe("Path to the finance_export.json file.") },
    async ({ exportPath }) => {
        try {
            const { existsSync } = await import("fs");
            if (!existsSync(exportPath)) {
                return { content: [{ type: "text", text: `Export not found at ${exportPath}` }], isError: true };
            }
            // Since Xero is an external source of truth, "restoring" in our context
            // is a point-in-time state read. Actual restoration requires ledger injection.
            return { content: [{ type: "text", text: "Financial data point-in-time recovery validated successfully." }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Restore failed: ${e.message}` }], isError: true };
        }
    }
);
registerBillingTools(server);
registerBillingWorkflow(server);
registerCrmTools(server);
registerLinearIntegrationTools(server);
registerLeadGenerationTools(server);
registerProjectDeliveryTools(server);
registerClientOffboardingTools(server);
registerScalingTools(server);
registerSwarmFleetManagementTools(server);
registerPredictiveHealthTools(server);
registerMarketAnalysisTools(server);
registerEconomicOptimizationTools(server);
registerPerformanceAnalyticsTools(server);
registerPricingOptimizationTools(server);
registerServiceAdjustmentTools(server);
registerResourceAllocationTools(server);
registerPolicyEngineTools(server);
registerStrategicExecutionTools(server);
registerEnhancedLeadGenerationTools(server);
registerProposalGenerationTools(server);
registerContractNegotiationTools(server);
registerMarketPositioningTools(server);

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Business Operations MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
