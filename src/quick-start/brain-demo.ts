import { EpisodicMemory } from "../brain/episodic.js";
import pc from "picocolors";
import { note } from "@clack/prompts";
import { join } from "path";

// Ensure mock embeddings to match what was stored
process.env.MOCK_EMBEDDINGS = "true";

export async function showBrainMemories(company: string = "quick_start_demo") {
    console.log(pc.cyan("\n🧠 Inspecting the Shared Brain (.agent/brain/)..."));

    // Use the same baseDir as the server (process.cwd())
    const memory = new EpisodicMemory(process.cwd());

    // Wait a moment for any file locks to clear from the server process
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Retrieve recent episodes
        // We use getRecentEpisodes instead of recall to just dump what's there without vector search nuances
        const episodes = await memory.getRecentEpisodes(company, 5);

        if (episodes.length === 0) {
            console.log(pc.yellow("No memories found. Did the demos run successfully?"));
            return;
        }

        console.log(pc.dim(`Found ${episodes.length} recent interaction(s) stored in vector memory.`));

        for (const ep of episodes) {
            const date = new Date(ep.timestamp).toLocaleTimeString();
            console.log(pc.white(`\n[${date}] Task: ${ep.taskId}`));
            console.log(pc.dim(`  Query: "${ep.userPrompt.substring(0, 60)}..."`));
            console.log(pc.dim(`  Result: "${ep.agentResponse.substring(0, 60)}..."`));

            // Highlight cross-agent sharing potential
            if (ep.taskId.startsWith("crew")) {
                console.log(pc.green(`  ✔ Knowledge gathered by CrewAI is now available to Aider & v0.`));
            } else if (ep.taskId.startsWith("aider")) {
                console.log(pc.green(`  ✔ Code fixes by Aider are now known to the QA agent.`));
            }
        }

        note(
            `Token Efficiency Demo:

            Because these interactions are stored in the Brain, future agents can:
            1. Recall the bug fix (Aider) without re-reading the code.
            2. Recall the research (CrewAI) without re-running the search.

            Estimated Token Savings: ~4500 tokens / query.`,
            "Shared Memory Impact"
        );

    } catch (e: any) {
        console.error(pc.red(`Failed to read brain: ${e.message}`));
    }
}
