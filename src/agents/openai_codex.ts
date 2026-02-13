import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import process from 'process';

// Helper to ensure directory exists
async function ensureDir(filePath: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));
    }
}

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Error: OPENAI_API_KEY environment variable is not set.");
        process.exit(1);
    }

    const openai = createOpenAI({ apiKey });
    // Using gpt-4o as the modern "Codex" equivalent
    const model = openai('gpt-4o');

    const args = process.argv.slice(2);
    // Assumes first argument is the prompt/instruction, subsequent are file paths
    const prompt = args[0];
    const files = args.slice(1);

    if (!prompt) {
        console.error("Error: No prompt provided.");
        process.exit(1);
    }

    let context = "";
    for (const f of files) {
        if (existsSync(f)) {
            try {
                const content = await readFile(f, 'utf-8');
                context += `\n--- FILE: ${f} ---\n${content}\n--- END FILE: ${f} ---\n`;
            } catch (e: any) {
                console.warn(`Warning: Could not read file ${f}: ${e.message}`);
            }
        } else {
            console.warn(`Warning: File not found: ${f}`);
        }
    }

    const systemPrompt = `You are OpenAI Codex, a powerful coding assistant.
You are running as a subagent CLI.
Your task is to follow the user's instructions based on the provided file context.

CAPABILITIES:
1. Analyze Code: Read the provided context and answer questions.
2. Write/Modify Files: To create or update a file, you MUST output a block in this EXACT format:

<<<<<<< FILE: path/to/file.ext
file content here...
>>>>>>>

You can output multiple file blocks.
Any text outside these blocks is treated as a message to the user.
If you are just asked to read/analyze, do not output file blocks unless asked to fix something.
`;

    try {
        const { text } = await generateText({
            model,
            system: systemPrompt,
            prompt: `User Instruction: ${prompt}\n\nContext Files:\n${context}`
        });

        console.log(text);

        // Parse and apply file changes
        const fileRegex = /<<<<<<< FILE: (.+?)\n([\s\S]+?)\n>>>>>>>/g;
        let match;
        let changesMade = false;

        while ((match = fileRegex.exec(text)) !== null) {
            const [_, filepath, content] = match;
            const targetPath = resolve(process.cwd(), filepath.trim());

            await ensureDir(targetPath);
            await writeFile(targetPath, content);
            console.error(`[OpenAI Codex] Wrote to ${filepath}`); // Log to stderr to keep stdout clean for the agent
            changesMade = true;
        }

        if (changesMade) {
             console.error(`[OpenAI Codex] Applied file changes.`);
        }

    } catch (error: any) {
        console.error(`[OpenAI Codex] Error: ${error.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
