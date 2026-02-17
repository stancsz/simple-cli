import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SOPEngine } from "../sop-engine.js";
import { SopClient } from "../client.js";
import { createLLM } from "../../../llm.js";
import { join } from "path";
import { existsSync, unlinkSync } from "fs";

// Shared mock functions
const mockGenerate = vi.fn();

// Mock dependencies
vi.mock("../../../llm.js", () => ({
    createLLM: vi.fn().mockImplementation(() => ({
        generate: mockGenerate
    }))
}));

vi.mock("../client.js", () => {
    return {
        SopClient: vi.fn().mockImplementation(() => ({
            init: vi.fn(),
            getToolNames: vi.fn().mockReturnValue(["fs_read", "fs_write", "brain_store_memory", "git_init", "email_send"]),
            executeTool: vi.fn().mockResolvedValue({ content: [{ text: "success" }] })
        }))
    };
});

describe("SOPEngine", () => {
    let engine: SOPEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        // Clean up progress file
        const progressPath = join(process.cwd(), ".agent", "sops", "sop-progress.json");
        if (existsSync(progressPath)) {
            unlinkSync(progressPath);
        }
        engine = new SOPEngine();
    });

    it("should list available SOPs", async () => {
        const sops = await engine.listSOPs();
        expect(Array.isArray(sops)).toBe(true);
        expect(sops).toContain("client_onboarding.md");
        expect(sops).toContain("weekly_report.md");
    });

    it("should create a new SOP from template", async () => {
        const topic = "Deploy to Production";
        const filename = "deploy_to_production.md";
        const filepath = join(process.cwd(), "sops", filename);

        // Mock LLM response for creation
        mockGenerate.mockResolvedValue({
            message: `## Goal
Deploy to prod.
## Prerequisites
- Access
## Steps
1. Build
2. Push`
        });

        const createdFile = await engine.createSOP(topic);
        expect(createdFile).toBe(filename);
        expect(existsSync(filepath)).toBe(true);

        // Clean up
        if (existsSync(filepath)) unlinkSync(filepath);
    });

    it("should execute an SOP step-by-step", async () => {
        const sopName = "client_onboarding";

        // Mock LLM response for Smart Router (Step 1)
        mockGenerate.mockResolvedValueOnce({
            tool: "fs_write",
            args: { path: "clients/new_client", content: "" }
        });
         // Mock LLM response for Smart Router (Step 2)
        mockGenerate.mockResolvedValueOnce({
            tool: "git_init",
            args: { path: "clients/new_client" }
        });
         // Mock LLM response for Smart Router (Step 3)
        mockGenerate.mockResolvedValueOnce({
            tool: "email_send",
            args: { to: "client@example.com" }
        });

        const result = await engine.executeSOP(sopName);

        expect(result.status).toBe("completed");
        expect(result.history.length).toBeGreaterThan(0);
        expect(mockGenerate).toHaveBeenCalledTimes(3);
    });
});
