import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createLLM } from "../../../llm.js";
import { join } from "path";
import { existsSync } from "fs";

export interface PredictiveAssignmentResult {
    recommended_agency_id: string;
    confidence_score: number;
    reasoning: string;
}

export async function assignTaskPredictively(task_description: string, priority: string = "normal"): Promise<PredictiveAssignmentResult> {
    const llm = createLLM();

    // 1. Query Brain for ecosystem patterns
    const brainSrc = join(process.cwd(), "src", "mcp_servers", "brain", "index.ts");
    const brainDist = join(process.cwd(), "dist", "mcp_servers", "brain", "index.js");
    let brainCmd = "node";
    let brainArgs = [brainDist];
    if (existsSync(brainSrc) && !existsSync(brainDist)) {
        brainCmd = "npx";
        brainArgs = ["tsx", brainSrc];
    }

    const brainTransport = new StdioClientTransport({ command: brainCmd, args: brainArgs });
    const brainClient = new Client({ name: "scheduler-brain-client", version: "1.0.0" }, { capabilities: {} });
    await brainClient.connect(brainTransport);

    let patternsContent = "";
    try {
        const patternsResult: any = await brainClient.callTool({
            name: "analyze_ecosystem_patterns",
            arguments: {}
        });
        if (patternsResult && patternsResult.content && patternsResult.content.length > 0) {
            patternsContent = patternsResult.content[0].text;
        }
    } catch (e: any) {
        console.warn("Failed to get ecosystem patterns:", e.message);
    } finally {
        await brainClient.close();
    }

    // 2. Query Agency Orchestrator for agency status (assuming we'd query an existing tool,
    // but we can query `monitor_project_status` or mock a status check).
    // Wait, the prompt specifically says:
    // "Query the agency_orchestrator MCP's get_agency_status to check current load and availability of the top-ranked agencies."
    // I need to add `get_agency_status` tool to agency_orchestrator.
    const orchSrc = join(process.cwd(), "src", "mcp_servers", "agency_orchestrator", "index.ts");
    const orchDist = join(process.cwd(), "dist", "mcp_servers", "agency_orchestrator", "index.js");
    let orchCmd = "node";
    let orchArgs = [orchDist];
    if (existsSync(orchSrc) && !existsSync(orchDist)) {
        orchCmd = "npx";
        orchArgs = ["tsx", orchSrc];
    }

    const orchTransport = new StdioClientTransport({ command: orchCmd, args: orchArgs });
    const orchClient = new Client({ name: "scheduler-orch-client", version: "1.0.0" }, { capabilities: {} });
    await orchClient.connect(orchTransport);

    let statusContent = "";
    try {
        const statusResult: any = await orchClient.callTool({
            name: "get_agency_status",
            arguments: {}
        });
        if (statusResult && statusResult.content && statusResult.content.length > 0) {
            statusContent = statusResult.content[0].text;
        }
    } catch (e: any) {
        console.warn("Failed to get agency status:", e.message);
    } finally {
        await orchClient.close();
    }

    // 3. Use LLM to synthesize and pick
    const prompt = `
You are an expert meta-orchestrator. Your goal is to assign the following task to the most suitable child agency.
Task Description: ${task_description}
Priority: ${priority}

Ecosystem Patterns (Historical Performance):
${patternsContent || "No patterns available."}

Current Agency Status (Load & Availability):
${statusContent || "No status available."}

Analyze the task requirements, cross-reference with the historical ecosystem patterns to find agencies highly suitable for this task type, and then filter by their current availability and load.
Select the single best agency for the job.

Return ONLY a valid JSON object matching this schema exactly:
{
  "recommended_agency_id": "string (the ID of the selected agency, or 'spawn_new' if none are suitable/available)",
  "confidence_score": 0.0 to 1.0,
  "reasoning": "string (brief explanation of why this agency was chosen over others)"
}
`;

    const response = await llm.generate(
        "You are a helpful JSON-producing assistant.",
        [{ role: "user", content: prompt }]
    );

    try {
        let jsonStr = response.raw || "";
        if (jsonStr.includes("```json")) {
            jsonStr = jsonStr.split("```json")[1].split("```")[0].trim();
        } else if (jsonStr.includes("```")) {
            jsonStr = jsonStr.split("```")[1].split("```")[0].trim();
        }

        const result = JSON.parse(jsonStr) as PredictiveAssignmentResult;

        // Ensure required fields exist
        if (!result.recommended_agency_id || typeof result.confidence_score !== "number" || !result.reasoning) {
             throw new Error("Missing required fields in LLM response");
        }

        return result;
    } catch (e: any) {
        throw new Error(`Failed to parse LLM response: ${e.message}\nRaw response: ${response.raw || response}`);
    }
}
