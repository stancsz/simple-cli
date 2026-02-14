import "dotenv/config";
import { LLM } from "../../src/llm.js";
import pc from "picocolors";

async function testProvider(name: string, provider: string, model: string) {
  console.log(pc.bold(`\n--- ${name} ---`));
  const llm = new LLM({ provider, model });
  try {
    const response = await llm.generate("sys", [
      { role: "user", content: "Say HELLO" },
    ]);
    if (response.raw.toLowerCase().includes("hello")) {
      console.log(pc.green(`✅ ${model} works!`));
    }
  } catch (e: any) {
    console.error(pc.red(`❌ ${model} failed: ${e.message}`));
  }
}

async function run() {
  // Anthropic Alternatives
  console.log(pc.yellow("Checking Anthropic variants..."));
  await testProvider(
    "Anthropic Latest",
    "anthropic",
    "claude-3-5-sonnet-latest",
  );
  await testProvider(
    "Anthropic Date-based",
    "anthropic",
    "claude-3-5-sonnet-20241022",
  );

  // Gemini Alternatives
  console.log(pc.yellow("\nChecking Gemini variants..."));
  await testProvider("Gemini 2.0 Exp", "google", "gemini-2.0-flash-exp");
  await testProvider("Gemini 1.5 Flash", "google", "gemini-1.5-flash");
}

run();
