import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScanDependenciesTool } from "./scan_dependencies.js";
import { registerMonitorApiActivityTool } from "./monitor_api_activity.js";
import { registerApplySecurityPatchTool } from "./apply_security_patch.js";

export function registerTools(server: McpServer) {
    registerScanDependenciesTool(server);
    registerMonitorApiActivityTool(server);
    registerApplySecurityPatchTool(server);
}
