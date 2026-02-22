import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import ora from "ora";
import pc from "picocolors";
import { note } from "@clack/prompts";

export async function runCrewAIDemo(client: Client) {
    const spinner = ora("Running CrewAI Demo...").start();

    // 1. Simulate starting a Crew
    spinner.text = "Initializing CrewAI agents (Researcher, Analyst)...";
    await new Promise(r => setTimeout(r, 1000));

    // 2. Call CrewAI
    spinner.text = "Asking Crew to research 'Future of AI'...";
    try {
        const result = await client.callTool({
            name: "start_crew",
            arguments: {
                task: "Research the key trends in AI Agent architecture for 2025."
            }
        });

        // @ts-ignore
        const output = result.content[0].text;
        spinner.succeed("CrewAI research completed.");
        note(output, "CrewAI Output");

        console.log(pc.green("✔ CrewAI completed multi-agent research."));
        console.log(pc.dim("  (Research findings stored in Shared Brain)"));

    } catch (e: any) {
        spinner.fail(`CrewAI task failed: ${e.message}`);
        throw e;
    }
}
