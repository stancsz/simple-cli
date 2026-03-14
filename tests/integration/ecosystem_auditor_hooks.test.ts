import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnChildAgency, mergeChildAgencies, retireChildAgency } from "../../src/mcp_servers/agency_orchestrator/tools/index";
import { EpisodicMemory } from "../../src/brain/episodic";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";

// Mock path for isolated tests
const TEST_DIR = path.join(process.cwd(), ".agent_test_audit_hooks");
process.env.JULES_AGENT_DIR = TEST_DIR;

vi.mock("../../src/brain/episodic", () => ({
    EpisodicMemory: class {
        store = vi.fn().mockResolvedValue(true);
        recall = vi.fn().mockResolvedValue([]);
    }
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class {
            constructor() {}
            connect = vi.fn().mockResolvedValue(true);
            callTool = vi.fn().mockImplementation(async (req) => {
                if (req.name === "log_audit_event") {
                    const auditDir = path.join(TEST_DIR, "audit_logs");
                    await fs.mkdir(auditDir, { recursive: true });
                    const logFilePath = path.join(auditDir, "audit_trail.jsonl");

                    const event = {
                        timestamp: Date.now(),
                        ...req.arguments
                    };
                    await fs.appendFile(logFilePath, JSON.stringify(event) + "\n", "utf8");
                }
                return { content: [{ text: "Success" }] };
            });
            close = vi.fn().mockResolvedValue(true);
        }
    };
});

describe("Phase 37 - Ecosystem Auditor (Cross-Server Hooks)", () => {
    let memory: EpisodicMemory;

    beforeAll(async () => {
        if (!existsSync(TEST_DIR)) {
            await fs.mkdir(TEST_DIR, { recursive: true });
        }
        memory = new EpisodicMemory(TEST_DIR);
    });

    afterAll(async () => {
        // Clean up mock directory
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        delete process.env.JULES_AGENT_DIR;
    });

    it("should log agency spawn event via orchestrator", async () => {
        const result = await spawnChildAgency("test_role", "context", 100, {}, memory);
        expect(result.status).toBe("spawned");

        const auditDir = path.join(TEST_DIR, "audit_logs");
        const logFilePath = path.join(auditDir, "audit_trail.jsonl");

        // Wait for potential async file operations in logToAuditor helper
        await new Promise(resolve => setTimeout(resolve, 500));

        const content = await fs.readFile(logFilePath, "utf8");
        expect(content).toContain("agency_spawn");
        expect(content).toContain(result.agency_id);
    });

    it("should log agency retire event via orchestrator", async () => {
        const agencyId = `agency_to_retire_${Date.now()}`;

        // Scaffold agency folder (in process.cwd() as the orchestrator uses process.cwd())
        const rootDir = process.cwd();
        const childDir = path.join(rootDir, ".agent", "child_agencies", agencyId);
        await fs.mkdir(childDir, { recursive: true });

        const result = await retireChildAgency(agencyId, memory);
        expect(result.status).toBe("retired");

        const auditDir = path.join(TEST_DIR, "audit_logs");
        const logFilePath = path.join(auditDir, "audit_trail.jsonl");

        await new Promise(resolve => setTimeout(resolve, 500));

        const content = await fs.readFile(logFilePath, "utf8");
        expect(content).toContain("agency_retire");
        expect(content).toContain(agencyId);
    });
});
