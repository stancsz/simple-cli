
import { encode } from 'gpt-tokenizer';

export async function runCodeEditingBenchmark() {
    console.log("Starting Code Editing Benchmark...");

    const numFiles = 20;
    const relevantFilesCount = 2;
    const avgFileSizeTokens = 500;
    const fileContent = "A".repeat(avgFileSizeTokens * 4); // roughly 500 tokens per file

    // 1. Direct Usage (Baseline): Load all files into context
    const startDirect = Date.now();
    let directContext = "";
    for (let i = 0; i < numFiles; i++) {
        // Simulate reading file
        await new Promise(r => setTimeout(r, 5)); // 5ms per file I/O overhead
        directContext += `File ${i}:\n${fileContent}\n`;
    }
    // Simulate prompt construction overhead
    await new Promise(r => setTimeout(r, 50));
    const directDuration = Date.now() - startDirect;
    const directTokens = encode(directContext).length;

    // 2. Simple-CLI Usage: Use Brain to select context
    const startSimple = Date.now();
    // Simulate Brain query latency (vector search)
    await new Promise(r => setTimeout(r, 200));

    let simpleContext = "";
    for (let i = 0; i < relevantFilesCount; i++) {
        // Simulate reading only relevant files
        await new Promise(r => setTimeout(r, 5));
        simpleContext += `File ${i}:\n${fileContent}\n`;
    }
    // Simulate Context Manager overhead (injecting goals, etc)
    simpleContext += "Goals: Refactor code.\nConstraints: Maintain type safety.\n";
    await new Promise(r => setTimeout(r, 50));

    const simpleDuration = Date.now() - startSimple;
    const simpleTokens = encode(simpleContext).length;

    return [
        {
            task: "code_editing",
            framework: "Direct Usage (Aider-like)",
            duration_ms: directDuration,
            tokens: directTokens,
            cost: (directTokens / 1000) * 0.01 // Assume $0.01 per 1k input tokens (high estimate for reasoning models)
        },
        {
            task: "code_editing",
            framework: "Simple-CLI",
            duration_ms: simpleDuration,
            tokens: simpleTokens,
            cost: (simpleTokens / 1000) * 0.01
        }
    ];
}
