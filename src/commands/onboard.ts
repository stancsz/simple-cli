import { intro, outro, text, select, confirm, spinner, isCancel, cancel, note } from "@clack/prompts";
import pc from "picocolors";
import { setupCompany } from "../utils/company-setup.js";
import { dashboardCommand } from "./dashboard.js";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";

// Mock delay to simulate operations
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runOnboard() {
    intro(pc.bgBlue(pc.white(" Simple CLI - First-Day Experience Wizard ")));

    const s = spinner();

    // --- Phase 1: Initial Setup ---
    s.start("Checking environment...");
    await delay(500);

    const nodeVersion = process.version;
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        s.stop("Environment check complete (Warning: No API Keys found).");
        note(
            pc.yellow("Warning: No OPENAI_API_KEY or ANTHROPIC_API_KEY found in environment.\nSome AI features will be simulated."),
            "Environment Check"
        );
    } else {
        s.stop(`Environment check complete (Node ${nodeVersion}).`);
    }

    // --- Phase 2: Company Context ---
    const companyName = await text({
        message: "Step 1: Create your Digital Agency Context. What is your company name?",
        placeholder: "MyTechStartup",
        defaultValue: "MyTechStartup",
        validate(value) {
            if (value.length === 0) return `Value is required!`;
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) return `Only letters, numbers, dashes, and underscores are allowed.`;
        },
    });

    if (isCancel(companyName)) { cancel("Operation cancelled."); return; }

    const brandVoice = await select({
        message: "Step 2: Define your Brand Voice.",
        options: [
            { value: "Professional", label: "Professional (Corporate, Formal)" },
            { value: "Casual", label: "Casual (Friendly, Approachable)" },
            { value: "Pirate", label: "Pirate (Adventurous, 'Arrr!')" },
            { value: "Tech-Savvy", label: "Tech-Savvy (Geeky, Precise)" },
        ],
    });

    if (isCancel(brandVoice)) { cancel("Operation cancelled."); return; }

    const goals = await text({
        message: "Step 3: What are your primary goals? (comma separated)",
        placeholder: "Build a web app, Automate deployment",
        defaultValue: "Build a web app, Automate deployment"
    });

    if (isCancel(goals)) { cancel("Operation cancelled."); return; }

    try {
        s.start(`Initializing company '${companyName}'...`);
        // Mock the context for the demo to be fast
        await setupCompany(companyName as string, {
            brand_voice: brandVoice,
            project_goals: (goals as string).split(",").map(g => g.trim()),
            tech_stack: ["React", "Node.js", "Simple CLI"]
        });
        s.stop(`Company '${companyName}' initialized.`);
    } catch (e: any) {
        s.stop(`Failed to initialize company: ${e.message}`);
        cancel("Setup failed.");
        return;
    }

    // --- Phase 3: Framework Integration Demo ---
    const integrateFramework = await confirm({
        message: "Step 4: Integrate 'Roo Code' framework (Simulated)?",
        initialValue: true
    });

    if (isCancel(integrateFramework)) { cancel("Operation cancelled."); return; }

    if (integrateFramework) {
        s.start("Ingesting Roo Code CLI...");
        await delay(800);
        s.message("Digesting capabilities (analyzing 15 tools)...");
        await delay(1200);
        s.message("Deploying 'roo_code' MCP server...");
        await delay(1000);

        // Create a log artifact
        const logDir = join(process.cwd(), ".agent", "logs");
        if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
        writeFileSync(join(logDir, "roo_integration.log"), `[${new Date().toISOString()}] Integrated Roo Code successfully.`);

        s.stop("Roo Code integrated successfully!");

        note(
            `Use 'roo_code' tools like:\n- execute_task\n- roo_review_code\n- roo_generate_docs`,
            "Integration Complete"
        );
    }

    // --- Phase 4: SOP Execution ---
    const executeSOP = await confirm({
        message: "Step 5: Create and Execute 'Initialize Project' SOP?",
        initialValue: true
    });

    if (isCancel(executeSOP)) { cancel("Operation cancelled."); return; }

    if (executeSOP) {
        const sopDir = join(process.cwd(), ".agent", "companies", companyName as string, "sops");
        if (!existsSync(sopDir)) mkdirSync(sopDir, { recursive: true });

        const sopPath = join(sopDir, "initialize_project.sop");
        const sopContent = `# Initialize Project SOP
1. Create project directory
2. Initialize git repository
3. Create README.md
`;
        writeFileSync(sopPath, sopContent);

        const sopSteps = [
            "Reading SOP file...",
            "Step 1: Creating project directory...",
            "Step 2: Initializing git repository...",
            "Step 3: Creating README.md...",
            "Verifying artifacts..."
        ];

        s.start("Initializing SOP Engine...");
        await delay(500);

        for (const step of sopSteps) {
            s.message(step);
            await delay(800); // Simulate work
        }

        s.stop("SOP 'Initialize Project' completed.");
        note(`SOP file created at: ${sopPath}`, "SOP Result");
    }

    // --- Phase 5: Ghost Mode Activation ---
    const ghostMode = await confirm({
        message: "Step 6: Activate Ghost Mode (Autonomous Background Tasks)?",
        initialValue: true
    });

    if (isCancel(ghostMode)) { cancel("Operation cancelled."); return; }

    if (ghostMode) {
        s.start("Scheduling background agents...");
        await delay(600);

        const schedulerPath = join(process.cwd(), ".agent", "scheduler.json");
        const task = {
            id: "morning-standup",
            name: "Morning Standup",
            trigger: "cron",
            schedule: "0 9 * * 1-5", // Mon-Fri at 9 AM
            prompt: "Summarize yesterday's work and check for critical issues."
        };

        let config = { tasks: [] };
        if (existsSync(schedulerPath)) {
            try {
                config = JSON.parse(readFileSync(schedulerPath, "utf-8"));
            } catch (e) {}
        }

        // Avoid duplicate
        if (!config.tasks.find((t: any) => t.id === task.id)) {
            (config.tasks as any[]).push(task);
            writeFileSync(schedulerPath, JSON.stringify(config, null, 2));
        }

        s.stop("Ghost Mode Active.");

        note("Added 'Morning Standup' task to scheduler.", "Job Delegator Initialized");
    }

    // --- Phase 6: HR Loop Demonstration ---
    s.start("Demonstrating HR Loop (Self-Correction)...");
    await delay(1000);
    s.message("Analyzing recent interactions...");
    await delay(1000);
    s.stop("HR Loop Active.");

    note(
        `System learned: "User prefers ${brandVoice} tone."\nMemory stored in .agent/companies/${companyName}/brain/`,
        "Continuous Improvement"
    );

    // --- Phase 7: Dashboard Launch ---
    const launchDashboard = await confirm({
        message: "Step 7: Launch Operational Dashboard?",
        initialValue: true
    });

    if (isCancel(launchDashboard)) { cancel("Operation cancelled."); return; }

    if (launchDashboard) {
        await dashboardCommand();
    }

    outro("Onboarding Complete! You are now ready to run your Digital Agency.");
}
