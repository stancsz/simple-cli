import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import pc from "picocolors";
import { note } from "@clack/prompts";

export async function showSharedContext(company: string = "quick_start_demo") {
    console.log(pc.cyan("\n📂 Updating Company Context (.agent/companies/.../context.json)..."));

    const contextPath = join(process.cwd(), ".agent", "companies", company, "config", "company_context.json");

    // Ensure dir exists
    if (!existsSync(dirname(contextPath))) {
        await mkdir(dirname(contextPath), { recursive: true });
    }

    let context: any = {
        name: "QuickStart Corp",
        mission: "Build the future of AI agents.",
        learnings: []
    };

    if (existsSync(contextPath)) {
        try {
            const content = await readFile(contextPath, "utf-8");
            context = JSON.parse(content);
        } catch (e) {
            // ignore
        }
    }

    // Simulate an update based on the demos run
    const newLearning = `Learned preference: User likes futuristic dashboard designs (from v0.dev session ${new Date().toLocaleTimeString()})`;
    context.learnings.push(newLearning);

    await writeFile(contextPath, JSON.stringify(context, null, 2));

    console.log(pc.green(`✔ Context updated with new learning:`));
    console.log(pc.dim(`  "${newLearning}"`));

    note(
        `Why this matters:

        The 'Context File' is the single source of truth for all agents.
        When Aider starts next time, it will see:
        "User likes futuristic dashboard designs"

        ...and automatically apply that style to your code!`,
        "Continuous Context Learning"
    );
}
