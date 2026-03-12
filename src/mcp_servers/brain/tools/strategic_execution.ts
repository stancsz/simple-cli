import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { MCP } from "../../../mcp.js";

interface StrategicInitiative {
    title: string;
    description: string;
    priority: number; // 1=Urgent, 2=High, 3=Normal, 4=Low
}

export async function generateStrategicInitiativesLogic(mcp: MCP, memory: EpisodicMemory, company?: string) {
    // Ensure all servers are initialized in the mcp instance
    await mcp.init();

    // Dynamically retrieve tools from MCP
    const tools = await mcp.getTools();

    // Helper function to safely execute an MCP tool
    const executeTool = async (toolName: string, args: any) => {
        const tool = tools.find(t => t.name === toolName);
        if (!tool) throw new Error(`Required tool '${toolName}' not found in MCP registry.`);
        const result = await tool.execute(args);

        // Handle standard MCP response format
        if (result && (result as any).content && (result as any).content.length > 0) {
            const contentText = (result as any).content[0].text;
            try {
                return JSON.parse(contentText);
            } catch {
                return contentText; // Return raw text if not JSON
            }
        }
        return result; // Fallback
    };

    // 1. Fetch Corporate Strategy via tool
    let strategy;
    try {
        strategy = await executeTool("read_strategy", { company });
    } catch (e: any) {
         throw new Error(`Failed to fetch Corporate Strategy via MCP: ${e.message}`);
    }

    if (!strategy || (typeof strategy === "string" && strategy.includes("No corporate strategy found"))) {
        throw new Error("No active Corporate Strategy found. Cannot generate initiatives.");
    }

    // 2. Fetch Performance Metrics via Business Ops tool
    let performanceMetrics;
    try {
        performanceMetrics = await executeTool("analyze_performance_metrics", { timeframe: "last_30_days", clientId: company });
    } catch (e: any) {
        console.warn(`Failed to fetch Performance Metrics via MCP: ${e.message}`);
        performanceMetrics = { status: "unavailable" };
    }

    // 3. Fetch System Health via Health Monitor tool
    let systemHealth;
    try {
        systemHealth = await executeTool("get_metrics", {});
    } catch (e: any) {
        console.warn(`Failed to fetch System Health via MCP: ${e.message}`);
        systemHealth = { status: "unavailable" };
    }

    // 4. Fetch Fleet Status via Business Ops tool
    let fleetStatus;
    try {
        fleetStatus = await executeTool("get_fleet_status", {});
    } catch (e: any) {
         console.warn(`Failed to fetch Fleet Status via MCP: ${e.message}`);
         fleetStatus = { status: "unavailable" };
    }

    const companyFleetStatus = company && Array.isArray(fleetStatus) ? fleetStatus.filter((f: any) => f.company === company) : fleetStatus;

    // 5. LLM Analysis
    const llm = createLLM();
    const prompt = `You are the Chief Operating Officer (COO) translating high-level strategy into execution.

CURRENT CORPORATE STRATEGY:
${JSON.stringify(strategy, null, 2)}

CURRENT PERFORMANCE METRICS:
${JSON.stringify(performanceMetrics, null, 2)}

SYSTEM HEALTH METRICS:
${JSON.stringify(systemHealth, null, 2)}

CURRENT FLEET STATUS:
${JSON.stringify(companyFleetStatus, null, 2)}

TASK:
Identify the largest strategic gaps by comparing our current operational KPIs against our strategic objectives.
Given our goals and our current state, what are the top 3 actionable initiatives we should launch immediately?

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
    "initiatives": [
        {
            "title": "Short, actionable title for the Linear issue",
            "description": "Detailed description explaining the 'why' (linking back to the strategic analysis) and the 'what' (expected outcome).",
            "priority": 2 // 1=Urgent, 2=High, 3=Normal, 4=Low
        }
    ],
    "rationale": "Brief explanation of the identified strategic gaps."
}`;

    const llmResponse = await llm.generate(prompt, []);
    let parsedResponse;
    try {
        let jsonStr = llmResponse.message || llmResponse.thought || "";
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }
        parsedResponse = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse LLM response: ${(e as Error).message}`);
    }

    if (!parsedResponse.initiatives || !Array.isArray(parsedResponse.initiatives)) {
         throw new Error("LLM response did not contain an 'initiatives' array.");
    }

    // 6. Create Linear Issues using MCP tools
    const results = [];

    // Ensure we have a "Strategic Initiatives" project or create one via MCP
    const projectName = company ? `Strategic Initiatives: ${company}` : "Global Strategic Initiatives";
    let projectId;
    try {
        const projectResult = await executeTool("create_linear_project", {
            dealId: company || "global",
            projectName: projectName,
            description: "Auto-generated project for tracking high-level strategic initiatives."
        });
        projectId = projectResult.id;
    } catch (e: any) {
        throw new Error(`Failed to initialize Strategic Initiatives project in Linear via MCP: ${e.message}`);
    }

    // Fetch existing issues to ensure idempotency
    let existingIssues: any[] = [];
    try {
        const issuesResult = await executeTool("get_linear_project_issues", { projectId });
        existingIssues = Array.isArray(issuesResult) ? issuesResult : [];
    } catch (e: any) {
        console.warn(`Failed to fetch existing Linear issues for idempotency check: ${e.message}`);
    }

    for (const init of parsedResponse.initiatives as StrategicInitiative[]) {
        // Check if an issue with a similar title already exists
        const isDuplicate = existingIssues.some(issue =>
            issue.title.toLowerCase() === init.title.toLowerCase()
        );

        if (isDuplicate) {
            results.push({
                title: init.title,
                status: "skipped",
                reason: "Duplicate issue already exists."
            });
            continue;
        }

        try {
            const issueResult = await executeTool("create_linear_issue", {
                projectId: projectId,
                title: init.title,
                description: `${init.description}\n\n*Auto-generated from Strategic Execution Engine.*`,
                priority: init.priority
            });

            results.push({
                title: init.title,
                url: issueResult.url,
                identifier: issueResult.identifier,
                status: "created"
            });
        } catch (e: any) {
            results.push({
                title: init.title,
                status: "failed",
                error: e.message
            });
        }
    }

    // 7. Store in Episodic Memory for auditing
    try {
         await memory.store(
             `strategic_execution_${Date.now()}`,
             `Generated initiatives based on gap analysis. Rationale: ${parsedResponse.rationale}`,
             JSON.stringify(results),
             ["strategic_execution", "linear", "phase_25_5"],
             company,
             undefined, false, undefined, undefined, 0, 0,
             "strategic_execution_log"
         );
    } catch (e) {
        console.warn("Failed to store strategic execution log in brain:", e);
    }

    return {
        rationale: parsedResponse.rationale,
        initiatives_created: results
    };
}

export function registerStrategicExecutionTools(server: McpServer, memory: EpisodicMemory, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "generate_strategic_initiatives",
        "Analyzes Corporate Strategy against current KPIs to automatically generate and create prioritized Linear issues for execution.",
        {
            company: z.string().optional().describe("Optional company name to filter strategy and metrics for a specific client context.")
        },
        async ({ company }) => {
            try {
                const results = await generateStrategicInitiativesLogic(mcp, memory, company);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(results, null, 2)
                    }]
                };
            } catch (e) {
                return {
                    content: [{
                        type: "text",
                        text: `Error generating strategic initiatives: ${(e as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
