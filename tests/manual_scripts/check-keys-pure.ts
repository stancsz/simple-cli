#!/usr/bin/env node
import "dotenv/config";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

async function testAnthropic() {
  console.log("Testing Anthropic...");
  try {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const { text } = await generateText({
      model: anthropic("claude-3-5-sonnet-latest"),
      messages: [{ role: "user", content: "hi" }],
    });
    console.log("Anthropic Success:", text);
  } catch (e: any) {
    console.error("Anthropic Error:", e.message);
  }
}

async function testGemini() {
  console.log("\nTesting Gemini...");
  try {
    const gemini = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    const { text } = await generateText({
      model: gemini("gemini-1.5-flash"),
      messages: [{ role: "user", content: "hi" }],
    });
    console.log("Gemini Success:", text);
  } catch (e: any) {
    console.error("Gemini Error:", e.message);
  }
}

async function run() {
  await testAnthropic();
  await testGemini();
}

run();
