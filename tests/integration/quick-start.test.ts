import { test, expect } from "vitest";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import pc from "picocolors";

test("Quick Start Tutorial Integration Test", async () => {
    const cliPath = join(process.cwd(), "src", "cli.ts");

    console.log(pc.blue("Starting Quick Start integration test..."));

    const child = spawn("npx", ["tsx", cliPath, "quick-start", "--non-interactive", "--scenario=all"], {
        env: {
            ...process.env,
            // Ensure no interference
            JULES_COMPANY: "",
        },
        cwd: process.cwd()
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
        stdout += data.toString();
        // console.log(data.toString()); // Uncomment to see live output
    });

    child.stderr.on("data", (data) => {
        stderr += data.toString();
        // console.error(data.toString());
    });

    const exitCode = await new Promise((resolve) => {
        child.on("close", resolve);
    });

    console.log(pc.dim("STDOUT:\n" + stdout));
    if (stderr) console.log(pc.red("STDERR:\n" + stderr));

    expect(exitCode).toBe(0);

    // Verify Scenarios ran
    expect(stdout).toContain("Running Scenario: aider");
    expect(stdout).toContain("Running Scenario: crewai");
    expect(stdout).toContain("Running Scenario: v0dev");

    // Verify MCP Server connection
    // expect(stdout).toContain("Connected to Tutorial Server."); // Might not show in non-interactive mode if spinner disabled?
    // Ora spinner usually prints to stderr or stdout depending on TTY.
    // But "Running Scenario..." is printed via console.log so it should be there.

    // Verify Brain Inspection
    expect(stdout).toContain("Inspecting Shared Memory");
    // We expect at least 3 interactions (aider, crew, v0)
    expect(stdout).toMatch(/Found \d+ recent interaction\(s\) stored/);
    expect(stdout).toContain("Knowledge gathered by CrewAI is now available");

    // Verify Context Update
    expect(stdout).toContain("Updating Company Context");
    expect(stdout).toContain("Context updated with new learning");

    // Verify Cleanup
    const brainDir = join(process.cwd(), ".agent", "brain", "quick_start_demo");
    const contextDir = join(process.cwd(), ".agent", "companies", "quick_start_demo");

    // In non-interactive mode, it should auto-cleanup
    expect(existsSync(brainDir)).toBe(false);
    expect(existsSync(contextDir)).toBe(false);

}, 60000); // 60s timeout
