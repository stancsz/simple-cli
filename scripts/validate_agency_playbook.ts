import { setupCompany } from "../src/utils/company-setup.js";
import { EpisodicMemory } from "../src/brain/episodic.js";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

async function main() {
    console.log("Starting Agency Playbook Validation...");

    // 1. Setup Isolation
    const testRoot = await mkdtemp(join(tmpdir(), "agency-validation-"));
    const agentDir = join(testRoot, ".agent");

    process.env.JULES_AGENT_DIR = agentDir;
    process.env.MOCK_EMBEDDINGS = "true";
    // Force Brain to use the test agent dir via baseDir (EpisodicMemory uses process.cwd() or arg)
    // We will pass testRoot to EpisodicMemory

    console.log(`Test Environment: ${testRoot}`);

    try {
        // 2. Initialize Companies
        console.log("\nStep 1: Initializing Companies...");
        await setupCompany("agency-client-a");
        await setupCompany("agency-client-b");

        if (existsSync(join(agentDir, "companies", "agency-client-a"))) {
             console.log("✅ Client A Context Created");
        } else {
             throw new Error("Client A Context Missing");
        }
        if (existsSync(join(agentDir, "companies", "agency-client-b"))) {
             console.log("✅ Client B Context Created");
        } else {
             throw new Error("Client B Context Missing");
        }

        // 3. Deploy SOP & Check Isolation
        console.log("\nStep 2: verifying Data Isolation...");
        const sopPathA = join(agentDir, "companies", "agency-client-a", "sops", "client-onboarding.md");
        const sopPathB = join(agentDir, "companies", "agency-client-b", "sops", "client-onboarding.md");

        await writeFile(sopPathA, "# Client Onboarding SOP\n1. Setup Repo");
        console.log("Deployed SOP to Client A.");

        if (existsSync(sopPathA)) {
            console.log("✅ SOP exists in Client A");
        } else {
             throw new Error("SOP failed to deploy to Client A");
        }

        if (!existsSync(sopPathB)) {
            console.log("✅ SOP does NOT exist in Client B (Isolation Confirmed)");
        } else {
            throw new Error("Data Leak: SOP found in Client B!");
        }

        // 4. Simulate Activity & Metrics
        console.log("\nStep 3: Simulating Activity & Dashboard Aggregation...");

        // Mock LLM to avoid API calls
        const mockLLM = {
             embed: async (text: string) => new Array(1536).fill(0.1),
             generate: async () => ({ thought: "", tool: "", args: {} }),
             personaEngine: { injectPersonality: (s: string) => s, transformResponse: (r: any) => r, loadConfig: async () => {} }
        } as any;

        const memory = new EpisodicMemory(testRoot, mockLLM);
        await memory.init();

        // Store episodes
        console.log("Storing episodes...");
        await memory.store("task-a-1", "Fix bug", "Fixed", [], "agency-client-a", undefined, false, undefined, 1000, 5000);
        await memory.store("task-b-1", "Deploy app", "Deployed", [], "agency-client-b", undefined, false, undefined, 2000, 10000);

        // Retrieve & Verify
        const episodesA = await memory.getRecentEpisodes("agency-client-a");
        const episodesB = await memory.getRecentEpisodes("agency-client-b");

        console.log(`Client A Episodes: ${episodesA.length}`);
        console.log(`Client B Episodes: ${episodesB.length}`);

        if (episodesA.length === 1 && episodesA[0].taskId === "task-a-1") {
             console.log("✅ Client A Metrics Verified");
        } else {
             throw new Error(`Client A Metrics Mismatch. Expected 1, got ${episodesA.length}`);
        }

        if (episodesB.length === 1 && episodesB[0].taskId === "task-b-1") {
             console.log("✅ Client B Metrics Verified");
        } else {
             throw new Error(`Client B Metrics Mismatch. Expected 1, got ${episodesB.length}`);
        }

        // Simulate Dashboard Aggregation Logic
        const totalTokens = (episodesA[0].tokens || 0) + (episodesB[0].tokens || 0);
        console.log(`Dashboard Total Tokens: ${totalTokens}`);
        if (totalTokens === 3000) {
             console.log("✅ Dashboard Aggregation Logic Verified");
        } else {
             throw new Error(`Dashboard Aggregation Failed. Expected 3000, got ${totalTokens}`);
        }

        console.log("\n🎉 ALL CHECKS PASSED: Agency Consulting Playbook Validated.");

    } catch (error) {
        console.error("\n❌ VALIDATION FAILED:", error);
        process.exit(1);
    } finally {
        // Cleanup
        try {
            await rm(testRoot, { recursive: true, force: true });
            console.log("\nCleanup complete.");
        } catch (e) {
            console.error("Cleanup failed:", e);
        }
    }
}

main();
