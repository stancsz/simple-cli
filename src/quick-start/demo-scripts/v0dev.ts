import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import ora from "ora";
import pc from "picocolors";
import { note } from "@clack/prompts";

export async function runV0DevDemo(client: Client) {
    const spinner = ora("Running v0.dev Demo...").start();

    // 1. Simulate UI Generation
    spinner.text = "Initializing v0.dev client...";
    await new Promise(r => setTimeout(r, 1000));

    // 2. Call v0.dev
    spinner.text = "Generating UI Component...";
    try {
        const result = await client.callTool({
            name: "v0dev_generate_component",
            arguments: {
                prompt: "A futuristic dashboard with a dark theme and glowing accents.",
                framework: "react"
            }
        });

        // @ts-ignore
        const output = result.content[0].text;
        spinner.succeed("v0.dev UI generated.");
        note(output, "v0.dev Output");

        console.log(pc.green("✔ v0.dev generated the React component based on your description."));
        console.log(pc.dim("  (Design artifacts stored in Shared Brain)"));

    } catch (e: any) {
        spinner.fail(`v0.dev task failed: ${e.message}`);
        throw e;
    }
}
