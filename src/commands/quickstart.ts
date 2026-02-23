import { intro, outro, text, confirm, spinner, isCancel, cancel, note } from "@clack/prompts";
import { setupCompany } from "../utils/company-setup.js";
import { dashboardCommand } from "./dashboard.js";
import pc from "picocolors";
import { join } from "path";
import { existsSync } from "fs";

// Mock delay to simulate operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runQuickStart() {
    intro(pc.bgBlue(pc.white(" Simple CLI - Interactive Quick Start Wizard ")));

    const s = spinner();

    // --- Step 1: Company Context ---
    let companyName = await text({
        message: "Step 1: Create a Demo Company Context. What should we call it?",
        placeholder: "demo-company",
        defaultValue: "demo-company",
        validate(value) {
            if (value.length === 0) return `Value is required!`;
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) return `Only letters, numbers, dashes, and underscores are allowed.`;
        },
    });

    if (isCancel(companyName)) {
        cancel("Operation cancelled.");
        return;
    }

    try {
        // Clean up previous demo run if exists
        const demoPath = join(process.cwd(), ".agent", "companies", companyName as string);
        if (existsSync(demoPath)) {
             // In a real scenario we might ask, but for a demo wizard, let's just reset or reuse.
             // Let's reuse setupCompany which handles existing dirs gracefully or we can force clean.
             // For the sake of a "fresh" demo experience, let's log a note.
        }

        s.start(`Initializing company '${companyName}'...`);
        // We mock the context for the demo to be fast
        await setupCompany(companyName as string, {
            brand_voice: "Innovative and agile",
            project_goals: ["Build a modern web app", "Demonstrate AI capabilities"],
            tech_stack: ["React", "Node.js", "Simple CLI"]
        });
        s.stop(`Company '${companyName}' initialized.`);
    } catch (e: any) {
        s.stop(`Failed to initialize company: ${e.message}`);
        cancel("Setup failed.");
        return;
    }

    // --- Step 2: Framework Integration (Roo Code) ---
    const integrateRoo = await confirm({
        message: "Step 2: Integrate 'Roo Code' framework (Simulated)?",
        initialValue: true
    });

    if (isCancel(integrateRoo)) { cancel("Operation cancelled."); return; }

    if (integrateRoo) {
        s.start("Ingesting Roo Code API...");
        await delay(800);
        s.message("Digesting capabilities (analyzing 15 tools)...");
        await delay(1200);
        s.message("Deploying 'roo_code' MCP server...");
        await delay(1000);
        s.stop("Roo Code integrated successfully!");

        note(
            `Use 'roo_code' tools like:\n- execute_task\n- roo_review_code\n- roo_generate_docs`,
            "Integration Complete"
        );
    }

    // --- Step 3: SOP Execution ---
    const executeSOP = await confirm({
        message: "Step 3: Execute 'Build a simple web app' SOP?",
        initialValue: true
    });

    if (isCancel(executeSOP)) { cancel("Operation cancelled."); return; }

    if (executeSOP) {
        const sopSteps = [
            "Scaffolding React project structure...",
            "Installing dependencies (react, react-dom)...",
            "Generating components (Header, Footer, Hero)...",
            "Adding responsive styles...",
            "Running tests..."
        ];

        s.start("Initializing SOP Engine...");
        await delay(500);

        for (const step of sopSteps) {
            s.message(step);
            await delay(800); // Simulate work
        }

        s.stop("SOP 'Build a simple web app' completed.");
        note("Project files generated in ./demo-app/", "SOP Result");
    }

    // --- Step 4: Ghost Mode ---
    const ghostMode = await confirm({
        message: "Step 4: Activate Ghost Mode (Autonomous Background Tasks)?",
        initialValue: true
    });

    if (isCancel(ghostMode)) { cancel("Operation cancelled."); return; }

    if (ghostMode) {
        s.start("Scheduling background agents...");
        await delay(600);
        s.stop("Ghost Mode Active.");

        console.log(pc.dim("\n--- [Simulated] Morning Standup Report (09:00 AM) ---"));
        console.log(pc.green("✔ Security Scan passed"));
        console.log(pc.green("✔ Dependencies updated"));
        console.log(pc.blue("ℹ 3 new PRs reviewed"));
        console.log(pc.dim("---------------------------------------------------\n"));
    }

    // --- Step 5: Dashboard ---
    const launchDashboard = await confirm({
        message: "Step 5: Launch Operational Dashboard?",
        initialValue: true
    });

    if (isCancel(launchDashboard)) { cancel("Operation cancelled."); return; }

    if (launchDashboard) {
        await dashboardCommand();
    }

    outro("Quick Start Wizard completed! You are now ready to use Simple CLI.");
}
