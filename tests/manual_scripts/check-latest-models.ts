import "dotenv/config";
import { LLM } from "../../src/llm.js";
import pc from "picocolors";

async function testProvider(name: string, provider: string, model: string) {
  console.log(pc.bold(`\n--- Testing ${name} ---`));
  console.log(pc.cyan(`🔌 Target: ${provider}:${model}`));

  // Create LLM instance manually
  const llm = new LLM({ provider, model });

  try {
    console.log(pc.yellow("⏳ Sending message..."));
    const response = await llm.generate("sys", [
      { role: "user", content: 'Say "HELLO"' },
    ]);

    if (response.raw.toLowerCase().includes("hello")) {
      console.log(pc.green(`✅ Success! ${model} is working.`));
    } else {
      console.log(pc.yellow(`⚠️ ${model} responded but content didn't match.`));
      console.log(pc.dim(`   Raw: ${response.raw}`));
    }
  } catch (e: any) {
    console.error(pc.red(`❌ ${model} failed.`));
    console.error(pc.red(`   Error: ${e.message}`));
  }
}

async function run() {
  // 1. Anthropic Latest
  if (process.env.ANTHROPIC_API_KEY) {
    await testProvider(
      "Anthropic Latest",
      "anthropic",
      "claude-3-7-sonnet-latest",
    );
  }

  // 2. Gemini Latest
  if (process.env.GEMINI_API_KEY) {
    await testProvider("Gemini Latest", "google", "gemini-2.0-flash-001");
  }
}

run();
