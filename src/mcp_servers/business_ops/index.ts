import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
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
