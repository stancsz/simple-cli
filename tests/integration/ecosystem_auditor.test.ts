import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { server } from "../../src/mcp_servers/ecosystem_auditor/index";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";

// Mock path for isolated tests
const TEST_DIR = path.join(process.cwd(), ".agent_test_audit_logs");
process.env.JULES_AGENT_DIR = TEST_DIR;

describe("Phase 37 - Ecosystem Auditor (Base Scenarios)", () => {
    beforeAll(async () => {
        if (!existsSync(TEST_DIR)) {
            await fs.mkdir(TEST_DIR, { recursive: true });
        }
    });

    afterAll(async () => {
        // Clean up mock directory
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        delete process.env.JULES_AGENT_DIR;
    });

    const extractTool = (name: string) => {
        const handlers = (server as any)._requestHandlers;
        let callHandlerFunc: any;

        if (handlers instanceof Map) {
            callHandlerFunc = handlers.get('tools/call');
        } else {
            callHandlerFunc = handlers['tools/call'];
        }

        return async (args: any) => {
             if (!callHandlerFunc) {
                 throw new Error("No call handler found");
             }
             return await callHandlerFunc({
                 method: "tools/call",
                 params: { name, arguments: args }
             }, {} as any);
        };
    };

    it("should successfully log an audit event", async () => {
        const payload = {
            event_type: "inter_agency_call",
            source_agency: "agency_a",
            target_agency: "agency_b",
            data: { test_key: "test_value" },
            metadata: { token_usage: 100 }
        };

        const callTool = extractTool("log_audit_event");
        const logResult = await callTool(payload);

        const content = (logResult as any).content[0].text;
        expect(content).toBe("Audit event logged successfully.");

        // Verify the file was created and contains the event
        const auditDir = path.join(TEST_DIR, "audit_logs");
        const logFilePath = path.join(auditDir, "audit_trail.jsonl");

        const fileContent = await fs.readFile(logFilePath, "utf8");
        const lines = fileContent.trim().split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(1);

        const parsedLine = JSON.parse(lines[lines.length - 1]);
        expect(parsedLine.event_type).toBe("inter_agency_call");
        expect(parsedLine.source_agency).toBe("agency_a");
        expect(parsedLine.target_agency).toBe("agency_b");
        expect(parsedLine.data.test_key).toBe("test_value");
        expect(parsedLine.metadata.token_usage).toBe(100);
        expect(parsedLine.timestamp).toBeDefined();
    });

    it("should query audit logs based on filters", async () => {
        const logTool = extractTool("log_audit_event");

        await logTool({
            event_type: "policy_change",
            data: { new_policy: "optimize_costs" }
        });

        const queryTool = extractTool("query_audit_logs");
        const queryResult = await queryTool({
            event_type: "policy_change"
        });

        const logsStr = (queryResult as any).content[0].text;
        const logs = JSON.parse(logsStr);

        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBeGreaterThanOrEqual(1);

        const policyEvent = logs.find((l: any) => l.event_type === "policy_change");
        expect(policyEvent).toBeDefined();
        expect(policyEvent.data.new_policy).toBe("optimize_costs");
    });

    it("should export audit logs to JSON and CSV formats", async () => {
        const exportTool = extractTool("export_audit_trail");

        const jsonResult = await exportTool({ format: "json" });
        const csvResult = await exportTool({ format: "csv" });

        const jsonStr = (jsonResult as any).content[0].text;
        const parsedJson = JSON.parse(jsonStr);
        expect(Array.isArray(parsedJson)).toBe(true);
        // "inter_agency_call" and "policy_change" logged from previous tests
        expect(parsedJson.length).toBeGreaterThanOrEqual(2);

        const csvStr = (csvResult as any).content[0].text;
        const csvLines = csvStr.trim().split("\n");
        // header + at least 2 events
        expect(csvLines.length).toBeGreaterThanOrEqual(3);
        expect(csvLines[0]).toBe("timestamp,event_type,source_agency,target_agency,data,metadata");
        expect(csvLines.some((l: string) => l.includes("policy_change"))).toBe(true);
    });
});
