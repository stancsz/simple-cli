import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { existsSync } from "fs";

// Mock @clack/prompts
const mockText = vi.fn();
const mockConfirm = vi.fn();
const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockCancel = vi.fn();
const mockSelect = vi.fn();
const mockIsCancel = vi.fn((val) => {
    return val === Symbol.for("cancel");
});

vi.mock("@clack/prompts", () => ({
    intro: mockIntro,
    outro: mockOutro,
    text: mockText,
    confirm: mockConfirm,
    cancel: mockCancel,
    select: mockSelect,
    isCancel: mockIsCancel
}));

// Mock process.cwd
let testRoot: string;

describe("Company Management Integration", () => {
    beforeEach(async () => {
        testRoot = await mkdtemp(join(tmpdir(), "company-mgmt-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);
        vi.clearAllMocks();

        // Create dummy templates
        const fs = await import("fs/promises");
        await fs.mkdir(join(testRoot, "templates", "company_onboarding", "default_sops"), { recursive: true });
        await fs.writeFile(join(testRoot, "templates", "company_onboarding", "default_sops", "test.md"), "# Test SOP");
        await fs.writeFile(join(testRoot, "templates", "company_onboarding", "default_brain_config.json"), "{}");
        await fs.writeFile(join(testRoot, "templates", "company_onboarding", "default_persona.json"), "{}");

        await fs.mkdir(join(testRoot, ".agent"), { recursive: true });
        await fs.writeFile(join(testRoot, ".agent", "config.json"), JSON.stringify({ companies: [] }));
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should initialize a company with templates", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");
        await setupCompany("test-co");

        const companyDir = join(testRoot, ".agent", "companies", "test-co");
        expect(existsSync(join(companyDir, "sops", "test.md"))).toBe(true);
        expect(existsSync(join(companyDir, "brain", "config.json"))).toBe(true);
        expect(existsSync(join(companyDir, "config", "persona.json"))).toBe(true);

        const config = JSON.parse(await readFile(join(testRoot, ".agent", "config.json"), "utf-8"));
        expect(config.companies).toContain("test-co");
        expect(config.active_company).toBe("test-co");
    });

    it("should switch active company", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");
        await setupCompany("co-a");
        await setupCompany("co-b");

        const { companyCommand } = await import("../../src/commands/company.js");

        // Initial state: co-b is active (last created)
        let config = JSON.parse(await readFile(join(testRoot, ".agent", "config.json"), "utf-8"));
        expect(config.active_company).toBe("co-b");

        // Switch to co-a
        await companyCommand("switch", "co-a");

        config = JSON.parse(await readFile(join(testRoot, ".agent", "config.json"), "utf-8"));
        expect(config.active_company).toBe("co-a");
    });

    it("should archive a company", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");
        await setupCompany("co-archive");

        const { companyCommand } = await import("../../src/commands/company.js");

        // Archive
        mockConfirm.mockResolvedValueOnce(true); // Confirm archive if active
        await companyCommand("archive", "co-archive");

        const config = JSON.parse(await readFile(join(testRoot, ".agent", "config.json"), "utf-8"));
        expect(config.companies).not.toContain("co-archive");
        expect(config.archived_companies).toContain("co-archive");
        expect(config.active_company).toBeUndefined();

        expect(existsSync(join(testRoot, ".agent", "companies", "co-archive"))).toBe(false);
        expect(existsSync(join(testRoot, ".agent", "archive", "companies", "co-archive"))).toBe(true);
    });

    it("should list companies", async () => {
         const { setupCompany } = await import("../../src/utils/company-setup.js");
         await setupCompany("co-1");

         const consoleSpy = vi.spyOn(console, "log");
         const { companyCommand } = await import("../../src/commands/company.js");

         await companyCommand("list");

         expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("co-1"));
    });

    it("should use archiveCompanyLogic correctly", async () => {
        const { setupCompany } = await import("../../src/utils/company-setup.js");
        await setupCompany("logic-co");

        const { archiveCompanyLogic } = await import("../../src/utils/company-management.js");
        const { loadConfig } = await import("../../src/config.js");

        let config = await loadConfig(testRoot);
        await archiveCompanyLogic(testRoot, config, "logic-co");

        config = await loadConfig(testRoot);
        expect(config.archived_companies).toContain("logic-co");
    });
});
