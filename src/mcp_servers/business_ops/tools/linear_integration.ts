import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateProject } from "./create_linear_project.js";
import { registerCreateIssue } from "./create_linear_issue.js";
import { registerSyncDealToLinear } from "./sync_deal_to_linear.js";

export function registerLinearIntegrationTools(server: McpServer) {
    registerCreateProject(server);
    registerCreateIssue(server);
    registerSyncDealToLinear(server);
}
