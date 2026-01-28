#!/usr/bin/env npx tsx
/**
 * Live test script for Simple-CLI
 * Tests basic LLM integration and tool execution
 */

import 'dotenv/config';
import { createProvider } from './src/providers/index.js';
import { loadTools } from './src/registry.js';
import { GitManager } from './src/lib/git.js';
import { applyEdit } from './src/lib/editor.js';

async function test() {
  console.log('=== Simple-CLI Live Test ===\n');

  // Test 1: Environment check
  console.log('1. Environment Check');
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;
  console.log(`   OpenAI: ${hasOpenAI ? '✓' : '✗'}`);
  console.log(`   Anthropic: ${hasAnthropic ? '✓' : '✗'}`);
  console.log(`   Gemini: ${hasGemini ? '✓' : '✗'}`);
  
  if (!hasOpenAI && !hasAnthropic && !hasGemini) {
    console.error('   ✗ No API keys found! Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY');
    process.exit(1);
  }
  console.log('   ✓ API key found\n');

  // Test 2: Provider initialization
  console.log('2. Provider Initialization');
  try {
    const provider = createProvider();
    console.log('   ✓ Provider created\n');
    
    // Test 3: Simple LLM call
    console.log('3. LLM Test (simple prompt)');
    const response = await provider.generateResponse(
      'You are a helpful assistant. Respond with exactly: "Hello from Simple-CLI!"',
      [{ role: 'user', content: 'Say hello' }]
    );
    console.log(`   Response: ${response.slice(0, 100)}...`);
    console.log('   ✓ LLM responded\n');
  } catch (error) {
    console.error(`   ✗ Provider error: ${error}`);
    process.exit(1);
  }

  // Test 4: Tool loading
  console.log('4. Tool Loading');
  try {
    const tools = await loadTools();
    console.log(`   Loaded ${tools.size} tools:`);
    for (const [name] of tools) {
      console.log(`     - ${name}`);
    }
    console.log('   ✓ Tools loaded\n');
  } catch (error) {
    console.error(`   ✗ Tool loading error: ${error}`);
  }

  // Test 5: Git integration
  console.log('5. Git Integration');
  try {
    const git = new GitManager();
    const isRepo = await git.isRepo();
    if (isRepo) {
      const branch = await git.currentBranch();
      const status = await git.status();
      console.log(`   Branch: ${branch}`);
      console.log(`   Modified: ${status.modified.length}, Staged: ${status.staged.length}`);
      console.log('   ✓ Git working\n');
    } else {
      console.log('   ⚠ Not a git repo (OK for testing)\n');
    }
  } catch (error) {
    console.error(`   ✗ Git error: ${error}`);
  }

  // Test 6: Editor fuzzy matching
  console.log('6. Editor (Fuzzy Matching)');
  const testContent = `function hello() {
  console.log("world");
}`;
  const result = applyEdit(
    testContent,
    'console.log("world")',
    'console.log("universe")'
  );
  console.log(`   Method: ${result.method}`);
  console.log(`   Success: ${result.success}`);
  if (result.success) {
    console.log('   ✓ Editor working\n');
  } else {
    console.log('   ✗ Editor failed\n');
  }

  // Test 7: Full agent test (tool call)
  console.log('7. Agent Test (with tool call)');
  try {
    const provider = createProvider();
    const systemPrompt = `You are a coding assistant. You have access to tools.
When asked to read a file, respond with JSON like:
{"tool": "readFiles", "args": {"paths": ["package.json"]}}

When you don't need a tool, respond with:
{"tool": "none", "message": "Your response here"}`;

    const response = await provider.generateResponse(
      systemPrompt,
      [{ role: 'user', content: 'What tools do you have available? Just respond with a message, no tool needed.' }]
    );
    
    // Try to parse response
    const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`   Tool: ${parsed.tool}`);
      if (parsed.message) {
        console.log(`   Message: ${parsed.message.slice(0, 80)}...`);
      }
    } else {
      console.log(`   Raw response: ${response.slice(0, 100)}...`);
    }
    console.log('   ✓ Agent test complete\n');
  } catch (error) {
    console.error(`   ✗ Agent test error: ${error}`);
  }

  console.log('=== All Tests Complete ===');
}

test().catch(console.error);
