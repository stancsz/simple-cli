import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Phase 26: Autonomous Market Expansion Plan Validation", () => {
    const docsDir = path.join(process.cwd(), "docs");

    it("should have a comprehensive implementation plan file", () => {
        const planPath = path.join(docsDir, "phase26_autonomous_market_expansion.md");
        expect(fs.existsSync(planPath)).toBe(true);

        const content = fs.readFileSync(planPath, "utf-8");
        expect(content).toContain("# Phase 26: Autonomous Market Expansion");
        expect(content).toContain("Deliverable 1: Strategic Lead Generation");
        expect(content).toContain("Deliverable 2: Proposal Generation Engine");
        expect(content).toContain("Deliverable 3: Contract Simulation Swarm");
        expect(content).toContain("Validation Criteria");
    });

    it("should update the ROADMAP.md with Phase 26 objectives", () => {
        const roadmapPath = path.join(docsDir, "ROADMAP.md");
        expect(fs.existsSync(roadmapPath)).toBe(true);

        const content = fs.readFileSync(roadmapPath, "utf-8");
        // Check for Phase 26 Section
        expect(content).toContain("## Phase 26: Autonomous Market Expansion");

        // Check for Key Objectives
        expect(content).toContain("Autonomous Lead Generation");
        expect(content).toContain("Intelligent Proposal Generation");
        expect(content).toContain("Contract Negotiation Simulation");
        expect(content).toContain("Market Positioning Automation");
        expect(content).toContain("Revenue Growth Validation");

        // Verify it's inserted before Legacy Achievements
        const phase26Index = content.indexOf("Phase 26: Autonomous Market Expansion");
        const legacyIndex = content.indexOf("Legacy Achievements");
        expect(phase26Index).toBeLessThan(legacyIndex);
    });

    it("should update the Technical Specification with Phase 26 Architecture", () => {
        const specsPath = path.join(docsDir, "specs.md");
        expect(fs.existsSync(specsPath)).toBe(true);

        const content = fs.readFileSync(specsPath, "utf-8");

        // Check for Section 17
        expect(content).toContain("## 17. Autonomous Market Expansion Architecture (Phase 26)");

        // Check for Architectural Components
        expect(content).toContain("Growth Engine Logic");
        expect(content).toContain("Proposal Generation Engine (RAG-Based)");
        expect(content).toContain("Contract Negotiation Swarm (Game Theoretic)");
    });
});
