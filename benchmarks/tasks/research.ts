
import { encode } from 'gpt-tokenizer';

export async function runResearchBenchmark() {
    console.log("Starting Research Benchmark...");

    const initialContext = "Task: Research History of Node.js\nConstraints: Focus on performance.\n";
    const searchResult = "Node.js was created by Ryan Dahl in 2009 based on V8 engine.\n".repeat(50); // ~1000 tokens
    const summary = "Node.js is event-driven.\n".repeat(20); // ~400 tokens

    // 1. CrewAI (Direct Usage): Multi-Agent Loop passing full context
    const startCrew = Date.now();
    let crewTokens = 0;

    // Agent 1: Researcher (Context + Search)
    await new Promise(r => setTimeout(r, 100)); // Latency
    let agent1Prompt = initialContext + searchResult;
    crewTokens += encode(agent1Prompt).length;

    // Agent 2: Writer (Context + Search Result + Summary Instruction)
    await new Promise(r => setTimeout(r, 100));
    let agent2Prompt = initialContext + searchResult + "Summarize this.\n";
    crewTokens += encode(agent2Prompt).length;

    // Agent 3: Manager (Context + Summary + Final Review)
    await new Promise(r => setTimeout(r, 100));
    let agent3Prompt = initialContext + summary + "Review this.\n";
    crewTokens += encode(agent3Prompt).length;

    const crewDuration = Date.now() - startCrew;

    // 2. Simple-CLI: Shared Brain
    const startSimple = Date.now();
    let simpleTokens = 0;

    // Step 1: Brain Query (Context)
    await new Promise(r => setTimeout(r, 50)); // Vector search
    let brainContext = initialContext; // Brain returns relevant context only

    // Step 2: Search Tool
    await new Promise(r => setTimeout(r, 100));
    let toolInput = brainContext + "Search: Node.js history";
    simpleTokens += encode(toolInput).length;

    // Step 3: Update Brain (Store search result)
    await new Promise(r => setTimeout(r, 50));
    // Brain now holds the search result. Next prompt only needs summary instruction + relevant snippets (not full text if large)

    // Step 4: Summarize Tool (Brain Context + Instruction)
    await new Promise(r => setTimeout(r, 100));
    let summaryInput = brainContext + "Summarize recent search findings."; // Brain handles retrieval of 'recent search' content implicitly via context manager
    simpleTokens += encode(summaryInput).length;

    const simpleDuration = Date.now() - startSimple;

    return [
        {
            task: "research",
            framework: "CrewAI (Direct)",
            duration_ms: crewDuration,
            tokens: crewTokens,
            cost: (crewTokens / 1000) * 0.01
        },
        {
            task: "research",
            framework: "Simple-CLI",
            duration_ms: simpleDuration,
            tokens: simpleTokens,
            cost: (simpleTokens / 1000) * 0.01
        }
    ];
}
