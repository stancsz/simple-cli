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
    };
});

// Import after mocks
import { server as auditorServer } from "../../src/mcp_servers/ecosystem_auditor/index.js";
import { auditLogger } from "../../src/mcp_servers/ecosystem_auditor/logger.js";
import { executeLogEcosystemEvent } from "../../src/mcp_servers/ecosystem_auditor/tools/log_event.js";
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

describe("Ecosystem Auditor MCP Server", () => {
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
        // Note: the handler might expect an empty object for request parameters based on ZodCompat parsing in newer SDKs
        const listToolsHandler = (auditorServer as any)._requestHandlers.get("tools/list");
        const toolsResult = await listToolsHandler({ method: "tools/list", params: {} });

        expect(toolsResult.tools).toBeDefined();

        const logTool = toolsResult.tools.find((t: any) => t.name === "log_ecosystem_event");
        expect(logTool).toBeDefined();
        expect(logTool.description).toContain("Logs a significant ecosystem event");
    });

    it("should log an event to the daily jsonl file using the logger", async () => {
        const mockEvent = {
            event_type: "communication",
            source_agency: "agency_A",
            target_agency: "agency_B",
            payload: { message: "Hello world" }
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
        expect(parsedData.payload.message).toBe("Hello world");
        expect(parsedData.timestamp).toBeDefined(); // Should auto-populate
    });

    it("should parse stringified JSON payloads correctly", async () => {
        const mockEvent = {
            event_type: "spawn",
            source_agency: "root",
            payload: JSON.stringify({ role: "developer" })
        };

        await executeLogEcosystemEvent(mockEvent);

        const callArgs = vi.mocked(fs.appendFile).mock.calls[0];
        const dataArg = callArgs[1] as string;

        const parsedData = JSON.parse(dataArg.trim());
        expect(parsedData.payload.role).toBe("developer");
    });

    it("should fall back to raw string payload if invalid JSON is provided", async () => {
        const mockEvent = {
            event_type: "anomaly",
            source_agency: "root",
            payload: "This is a plain text anomaly, not json"
        };

        await executeLogEcosystemEvent(mockEvent);

        const callArgs = vi.mocked(fs.appendFile).mock.calls[0];
        const dataArg = callArgs[1] as string;

        const parsedData = JSON.parse(dataArg.trim());
        expect(parsedData.payload.raw).toBe("This is a plain text anomaly, not json");
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
        expect(loggedEvent.payload.role).toBe("frontend_engineer");
        expect(loggedEvent.payload.swarm_config.model).toBe("claude-3-haiku");
    });
});
