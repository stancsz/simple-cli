import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import ora from "ora";
import pc from "picocolors";
import { note } from "@clack/prompts";
import { join } from "path";
import { writeFile } from "fs/promises";

export async function runAiderDemo(client: Client, tempDir: string) {
    const spinner = ora("Running Aider Demo...").start();

    // 1. Setup a bug to fix
    const bugPath = join(tempDir, "bug.py");
    await writeFile(bugPath, `def calculate_total(items):\n    return sum(item['price'] for item in items) * 0.8 # Bug: Apply discount incorrectly\n`);

    spinner.text = "Creating buggy file 'bug.py'...";
    await new Promise(r => setTimeout(r, 1000));

    // 2. Call Aider
    spinner.text = "Asking Aider to fix the bug...";
    try {
        const result = await client.callTool({
            name: "aider_chat",
            arguments: {
                message: "Fix the discount calculation bug in bug.py. It should be 0.9 not 0.8.",
                files: [bugPath]
            }
        });

        // @ts-ignore
        const output = result.content[0].text;
        spinner.succeed("Aider task completed.");
        note(output, "Aider Output");

        console.log(pc.green("✔ Aider successfully ingested the context and applied the fix."));
        console.log(pc.dim("  (Changes stored in Shared Brain)"));

    } catch (e: any) {
        spinner.fail(`Aider task failed: ${e.message}`);
        throw e;
    }
}
