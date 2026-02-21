import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { existsSync } from "fs";

// Mock @clack/prompts
const mockText = vi.fn();
const mockConfirm = vi.fn();
const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockCancel = vi.fn();
const mockIsCancel = vi.fn((val) => {
    return val === Symbol.for("cancel");
});

vi.mock("@clack/prompts", () => ({
    intro: mockIntro,
    outro: mockOutro,
    text: mockText,
    confirm: mockConfirm,
    cancel: mockCancel,
    isCancel: mockIsCancel
}));

// We need to mock LanceConnector if we want to avoid native module issues or verify it was called.
// But requirement says "Test LanceDB connection".
// Let's rely on real LanceConnector if possible.
// If it fails, we might need to mock it.

describe("Company Initialization", () => {
    let testRoot: string;

    beforeEach(async () => {
        testRoot = await mkdtemp(join(tmpdir(), "company-init-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);
        vi.clearAllMocks();

        // Ensure templates directory exists in testRoot so setupCompany can find it
        // OR setupCompany looks in process.cwd()/templates.
        // Since we mocked cwd to testRoot, we need to copy templates there or create dummy one.
        const fs = await import("fs/promises");
        await fs.mkdir(join(testRoot, "templates"), { recursive: true });
        await fs.writeFile(join(testRoot, "templates", "company_context.json.template"),
            JSON.stringify({ name: "{{COMPANY_NAME}}", brand_voice: "Default" })
        );
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should initialize a new company via setupCompany utility", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");

        await setupCompany("test-corp", {
            brand_voice: "Fun",
            project_goals: ["World Domination"],
            tech_stack: ["Cobol"]
        });

        // Verify directories
        expect(existsSync(join(testRoot, ".agent", "companies", "test-corp", "brain"))).toBe(true);
        expect(existsSync(join(testRoot, ".agent", "companies", "test-corp", "config"))).toBe(true);

        // Verify context file
        const contextPath = join(testRoot, ".agent", "companies", "test-corp", "config", "company_context.json");
        expect(existsSync(contextPath)).toBe(true);
        const context = JSON.parse(await readFile(contextPath, "utf-8"));
        expect(context.name).toBe("test-corp");
        expect(context.brand_voice).toBe("Fun");

        // Verify config.json
        const configPath = join(testRoot, ".agent", "config.json");
        expect(existsSync(configPath)).toBe(true);
        const config = JSON.parse(await readFile(configPath, "utf-8"));
        expect(config.companies).toContain("test-corp");
    });

    it("should run initCompany command interactively", async () => {
        const { initCompany } = await import("../../src/commands/init-company.js");

        // Mock inputs
        mockText.mockResolvedValueOnce("interactive-corp"); // Name
        mockConfirm.mockResolvedValueOnce(true); // Configure?
        mockText.mockResolvedValueOnce("Serious"); // Voice
        mockText.mockResolvedValueOnce("Profit"); // Goals
        mockText.mockResolvedValueOnce("Rust"); // Stack

        await initCompany();

        // Verify logic was called
        expect(mockIntro).toHaveBeenCalled();
        expect(mockOutro).toHaveBeenCalledWith(expect.stringContaining("interactive-corp"));

        // Verify persistence
        const contextPath = join(testRoot, ".agent", "companies", "interactive-corp", "config", "company_context.json");
        expect(existsSync(contextPath)).toBe(true);
        const context = JSON.parse(await readFile(contextPath, "utf-8"));
        expect(context.name).toBe("interactive-corp");
        expect(context.brand_voice).toBe("Serious");
    });

    it("should handle idempotency (existing company)", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");

        await setupCompany("dup-corp");
        await setupCompany("dup-corp"); // Run again

        const configPath = join(testRoot, ".agent", "config.json");
        const config = JSON.parse(await readFile(configPath, "utf-8"));
        const occurrences = config.companies.filter((c: string) => c === "dup-corp").length;
        expect(occurrences).toBe(1);
    });
});
