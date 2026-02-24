import { execSync } from "child_process";
import { describe, it, expect } from "vitest";
import { join } from "path";

describe("Quick Start Wizard Integration", () => {
    const cliPath = join(process.cwd(), "src/cli.ts");

    // Helper to run the CLI command
    const runQuickStart = (scenario: string) => {
        // We set JULES_TEST_MODE to skip interactive confirmations at the end
        // and force non-interactive behavior where applicable (though --scenario handles the main flow)
        // FORCE_COLOR: 0 disables ANSI colors to make string matching easier, though Clack might still add some chars.
        // ORA_ENABLED: false disables spinner animations.
        const env = { ...process.env, JULES_TEST_MODE: "true", FORCE_COLOR: "0" };
        const cmd = `npx tsx ${cliPath} quick-start --scenario ${scenario} --demo-mode`;

        try {
            return execSync(cmd, { encoding: "utf-8", stdio: "pipe", env });
        } catch (e: any) {
            // If the command fails, return stdout + stderr for debugging
            throw new Error(`Command failed: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}`);
        }
    };

    it("should execute 'bug-fix' scenario successfully", () => {
        console.log("Running bug-fix scenario...");
        const output = runQuickStart("bug-fix");

        // Verify Header
        expect(output).toContain("Simple Biosphere - Quick Start Wizard");

        // Verify MCP Traffic Logging
        expect(output).toContain("[MCP Tx]");
        expect(output).toContain("aider_chat");
        expect(output).toContain("[MCP Rx]");

        // Verify Mock Server Response content
        expect(output).toContain("Aider Simulation"); // Updated expectation
        expect(output).toContain("Applying fix"); // Updated expectation
    }, 60000);

    it("should execute 'research' scenario successfully", () => {
        console.log("Running research scenario...");
        const output = runQuickStart("research");

        expect(output).toContain("start_crew");
        expect(output).toContain("CrewAI Simulation"); // Updated expectation
        expect(output).toContain("Agent 'Researcher' found relevant data"); // Updated expectation
    }, 60000);

    it("should execute 'ui' scenario successfully", () => {
        console.log("Running ui scenario...");
        const output = runQuickStart("ui");

        expect(output).toContain("v0dev_generate_component");
        expect(output).toContain("v0.dev Simulation"); // Updated expectation
        expect(output).toContain("Generating UI for"); // Updated expectation
    }, 60000);
});
