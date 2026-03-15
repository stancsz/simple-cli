import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";

// Hoist mocks to the top level
vi.mock("fs", async () => {
    const actual = await vi.importActual<typeof import("fs")>("fs");
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
});

vi.mock("fs/promises", async () => {
    const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises");
    return {
        ...actual,
        appendFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
        unlink: vi.fn().mockResolvedValue(undefined),
        stat: vi.fn().mockResolvedValue({ size: 100 }),
    };
});

// Import after mocks
import { server as auditorServer } from "../../src/mcp_servers/ecosystem_auditor/index.js";
import { auditLogger, AuditLogManager } from "../../src/mcp_servers/ecosystem_auditor/log_manager.js";
import { executeLogEcosystemEvent } from "../../src/mcp_servers/ecosystem_auditor/tools.js";
import { spawnChildAgency } from "../../src/mcp_servers/agency_orchestrator/tools/index.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";

// Mock EpisodicMemory
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                store: vi.fn().mockResolvedValue(true),
                recall: vi.fn().mockResolvedValue([]),
            };
        }),
    };
});

describe("Ecosystem Auditor MCP Server Validation", () => {
    let mockMemory: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMemory = {
            store: vi.fn().mockResolvedValue(true),
            recall: vi.fn().mockResolvedValue([]),
        };
        // Also override the constructor globally for any internal instantiations like in spawnChildAgency
        vi.mocked(EpisodicMemory).mockImplementation(() => mockMemory as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should initialize the server and expose log_ecosystem_event tool", async () => {
        // Find the handler for tools/list.
        const listToolsHandler = (auditorServer as any)._requestHandlers.get("tools/list");
        const toolsResult = await listToolsHandler({ method: "tools/list", params: {} });

        expect(toolsResult.tools).toBeDefined();

        const logTool = toolsResult.tools.find((t: any) => t.name === "log_ecosystem_event");
        expect(logTool).toBeDefined();
        expect(logTool.description).toContain("Logs a significant ecosystem event");
    });

    it("should log an event to the daily jsonl file using the log manager", async () => {
        const mockEvent = {
            event_type: "communication",
            source_agency: "agency_A",
            target_agency: "agency_B",
            data: { message: "Hello world" }
        };

        const result = await executeLogEcosystemEvent(mockEvent);

        expect(result.success).toBe(true);
        expect(result.message).toContain("Successfully logged ecosystem event: communication");

        // Verify fs/promises appendFile was called
        expect(fs.appendFile).toHaveBeenCalledTimes(1);

        const callArgs = vi.mocked(fs.appendFile).mock.calls[0];
        const filenameArg = callArgs[0] as string;
        const dataArg = callArgs[1] as string;

        expect(filenameArg).toContain("ecosystem_logs_");
        expect(filenameArg).toContain(".jsonl");

        const parsedData = JSON.parse(dataArg.trim());
        expect(parsedData.event_type).toBe("communication");
        expect(parsedData.source_agency).toBe("agency_A");
        expect(parsedData.data.message).toBe("Hello world");
        expect(parsedData.timestamp).toBeDefined(); // Should auto-populate
    });

    it("should parse stringified JSON data correctly", async () => {
        const mockEvent = {
            event_type: "spawn",
            source_agency: "root",
            data: JSON.stringify({ role: "developer" })
        };

        await executeLogEcosystemEvent(mockEvent);

        const callArgs = vi.mocked(fs.appendFile).mock.calls[0];
        const dataArg = callArgs[1] as string;

        const parsedData = JSON.parse(dataArg.trim());
        expect(parsedData.data.role).toBe("developer");
    });

    it("should fall back to raw string data if invalid JSON is provided", async () => {
        const mockEvent = {
            event_type: "anomaly",
            source_agency: "root",
            data: "This is a plain text anomaly, not json"
        };

        await executeLogEcosystemEvent(mockEvent);

        const callArgs = vi.mocked(fs.appendFile).mock.calls[0];
        const dataArg = callArgs[1] as string;

        const parsedData = JSON.parse(dataArg.trim());
        expect(parsedData.data.raw).toBe("This is a plain text anomaly, not json");
    });

    it("should integrate with Agency Orchestrator's spawnChildAgency", async () => {
        // Spy on the logger instance directly
        const logSpy = vi.spyOn(auditLogger, "logEvent");

        // Execute a spawn action
        const result = await spawnChildAgency(
            "frontend_engineer",
            "Build UI",
            50000,
            { model: "claude-3-haiku" },
            mockMemory
        );

        expect(result.status).toBe("spawned");
        expect(result.agency_id).toContain("agency_");

        // Verify the logger was called synchronously during spawn
        expect(logSpy).toHaveBeenCalledTimes(1);
        const loggedEvent = logSpy.mock.calls[0][0];

        expect(loggedEvent.event_type).toBe("spawn");
        expect(loggedEvent.source_agency).toBe("root");
        expect(loggedEvent.target_agency).toBe(result.agency_id);
        expect(loggedEvent.data.role).toBe("frontend_engineer");
        expect(loggedEvent.data.swarm_config.model).toBe("claude-3-haiku");
    });

    it("should automatically rotate old logs when writing new events", async () => {
        const fakeFiles = [
            "ecosystem_logs_2026-03-01.jsonl",
            "ecosystem_logs_2026-03-02.jsonl",
            "ecosystem_logs_2026-03-03.jsonl",
            "ecosystem_logs_2026-03-04.jsonl",
            "ecosystem_logs_2026-03-05.jsonl",
            "ecosystem_logs_2026-03-06.jsonl",
            "ecosystem_logs_2026-03-07.jsonl",
            "ecosystem_logs_2026-03-08.jsonl",
            "ecosystem_logs_2026-03-09.jsonl",
        ];
        vi.mocked(fs.readdir).mockResolvedValue(fakeFiles as any);

        const mockEvent = {
            event_type: "communication",
            source_agency: "root",
            data: {}
        };
        await executeLogEcosystemEvent(mockEvent);

        // Sleep shortly to allow background async rotate to finish
        await new Promise(resolve => setTimeout(resolve, 50));

        // 9 files, max is 7, so it should have deleted the first 2 (oldest)
        expect(fs.unlink).toHaveBeenCalledTimes(2);

        const call1 = vi.mocked(fs.unlink).mock.calls[0][0] as string;
        const call2 = vi.mocked(fs.unlink).mock.calls[1][0] as string;

        expect(call1).toContain("ecosystem_logs_2026-03-01.jsonl");
        expect(call2).toContain("ecosystem_logs_2026-03-02.jsonl");
    });
});
