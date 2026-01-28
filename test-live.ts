#!/usr/bin/env npx tsx
/**
 * Comprehensive Live Test Suite for Simple-CLI
 * Tests LLM integration, tool execution, multi-turn conversations, and agent capabilities
 */

import 'dotenv/config';
import { createProvider } from './src/providers/index.js';
import { loadTools, type Tool } from './src/registry.js';
import { GitManager } from './src/lib/git.js';
import { applyEdit, parseEditBlocks, applyFileEdits } from './src/lib/editor.js';
import { writeFile, readFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = '/workspace/test-workspace';
const DIVIDER = '═'.repeat(60);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`\n${DIVIDER}`);
  console.log(`🧪 TEST: ${name}`);
  console.log(DIVIDER);
  
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`\n✅ PASSED (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`\n❌ FAILED: ${errorMsg}`);
  }
}

async function setupTestDir(): Promise<void> {
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true });
  }
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true });
  }
}

// ============================================
// TEST 1: Basic Environment & Provider
// ============================================
async function testEnvironment(): Promise<void> {
  console.log('Checking API keys...');
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;
  
  console.log(`  OpenAI: ${hasOpenAI ? '✓' : '✗'}`);
  console.log(`  Anthropic: ${hasAnthropic ? '✓' : '✗'}`);
  console.log(`  Gemini: ${hasGemini ? '✓' : '✗'}`);
  
  if (!hasOpenAI && !hasAnthropic && !hasGemini) {
    throw new Error('No API keys found');
  }
  
  const provider = createProvider();
  console.log(`\nProvider created: ${provider.name} (${provider.model})`);
}

// ============================================
// TEST 2: Tool Loading & Execution
// ============================================
async function testToolLoading(): Promise<void> {
  const tools = await loadTools();
  console.log(`Loaded ${tools.size} tools:`);
  
  const expectedTools = ['readFiles', 'writeFiles', 'runCommand', 'git', 'glob', 'grep', 'memory', 'lint', 'scrapeUrl'];
  for (const expected of expectedTools) {
    if (!tools.has(expected)) {
      throw new Error(`Missing expected tool: ${expected}`);
    }
    console.log(`  ✓ ${expected}`);
  }
}

// ============================================
// TEST 3: Direct Tool Execution - readFiles
// ============================================
async function testReadFilesTool(): Promise<void> {
  const tools = await loadTools();
  const readFiles = tools.get('readFiles')!;
  
  const result = await readFiles.execute({ paths: ['package.json'] });
  const files = result as Array<{ path: string; content?: string; error?: string }>;
  
  if (!files[0]?.content) {
    throw new Error('Failed to read package.json');
  }
  
  const pkg = JSON.parse(files[0].content);
  console.log(`  Read package.json: ${pkg.name} v${pkg.version}`);
  console.log(`  Content length: ${files[0].content.length} chars`);
}

// ============================================
// TEST 4: Direct Tool Execution - writeFiles
// ============================================
async function testWriteFilesTool(): Promise<void> {
  await setupTestDir();
  const tools = await loadTools();
  const writeFiles = tools.get('writeFiles')!;
  
  // Test creating a new file
  const testFile = join(TEST_DIR, 'test-file.txt');
  const result = await writeFiles.execute({
    files: [{ path: testFile, content: 'Hello, World!' }]
  });
  
  const writeResults = result as Array<{ path: string; success: boolean; message: string }>;
  if (!writeResults[0]?.success) {
    throw new Error(`Failed to write file: ${writeResults[0]?.message}`);
  }
  
  // Verify content
  const content = await readFile(testFile, 'utf-8');
  if (content !== 'Hello, World!') {
    throw new Error('File content mismatch');
  }
  
  console.log(`  Created: ${testFile}`);
  console.log(`  Content verified: "${content}"`);
}

// ============================================
// TEST 5: Search/Replace Edit
// ============================================
async function testSearchReplaceEdit(): Promise<void> {
  await setupTestDir();
  const tools = await loadTools();
  const writeFiles = tools.get('writeFiles')!;
  
  // Create a file first
  const testFile = join(TEST_DIR, 'search-replace.ts');
  await writeFile(testFile, `function greet(name: string) {
  console.log("Hello, " + name);
}

greet("World");
`, 'utf-8');
  
  // Apply search/replace
  const result = await writeFiles.execute({
    files: [{
      path: testFile,
      searchReplace: [
        { search: '"Hello, "', replace: '"Greetings, "' },
        { search: '"World"', replace: '"Universe"' }
      ]
    }]
  });
  
  const writeResults = result as Array<{ path: string; success: boolean; message: string }>;
  if (!writeResults[0]?.success) {
    throw new Error(`Search/replace failed: ${writeResults[0]?.message}`);
  }
  
  // Verify changes
  const content = await readFile(testFile, 'utf-8');
  if (!content.includes('"Greetings, "') || !content.includes('"Universe"')) {
    throw new Error('Search/replace content verification failed');
  }
  
  console.log(`  Applied 2 search/replace operations`);
  console.log(`  Verified: "Hello" -> "Greetings", "World" -> "Universe"`);
}

// ============================================
// TEST 6: Glob Tool
// ============================================
async function testGlobTool(): Promise<void> {
  const tools = await loadTools();
  const glob = tools.get('glob')!;
  
  // Note: The glob implementation treats *.ts as recursive, finding all .ts files
  const result = await glob.execute({ pattern: '*.ts', cwd: '/workspace/src' });
  const globResult = result as { pattern: string; matches: string[]; count: number; truncated: boolean };
  
  if (!globResult.matches || globResult.matches.length === 0) {
    throw new Error('Glob returned no files');
  }
  
  console.log(`  Found ${globResult.count} TypeScript files in src/`);
  console.log(`  Sample: ${globResult.matches.slice(0, 3).join(', ')}`);
  
  // Verify expected files exist
  const hasRegistry = globResult.matches.some(f => f.includes('registry.ts'));
  const hasIndex = globResult.matches.some(f => f.includes('index.ts'));
  if (!hasRegistry || !hasIndex) {
    throw new Error('Expected files not found');
  }
}

// ============================================
// TEST 7: Grep Tool
// ============================================
async function testGrepTool(): Promise<void> {
  const tools = await loadTools();
  const grep = tools.get('grep')!;
  
  const result = await grep.execute({ 
    pattern: 'export const',
    path: '/workspace/src/tools'
  });
  
  const grepResult = result as { pattern: string; matches: Array<{ file: string; line: number; text: string }>; files: string[]; count: number; truncated: boolean };
  
  if (!grepResult.matches || grepResult.matches.length === 0) {
    throw new Error('Grep returned no matches');
  }
  
  console.log(`  Found ${grepResult.count} exports in src/tools/`);
  console.log(`  Files: ${grepResult.files.slice(0, 3).join(', ')}`);
  console.log(`  Sample match: ${grepResult.matches[0]?.file}:${grepResult.matches[0]?.line}`);
}

// ============================================
// TEST 8: RunCommand Tool
// ============================================
async function testRunCommandTool(): Promise<void> {
  const tools = await loadTools();
  const runCommand = tools.get('runCommand')!;
  
  // Test simple command
  const result = await runCommand.execute({ command: 'echo "Hello from CLI"' });
  const cmdResult = result as { exitCode: number; stdout: string; stderr: string };
  
  if (cmdResult.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${cmdResult.exitCode}`);
  }
  
  if (!cmdResult.stdout.includes('Hello from CLI')) {
    throw new Error('Unexpected command output');
  }
  
  console.log(`  Exit code: ${cmdResult.exitCode}`);
  console.log(`  Output: ${cmdResult.stdout}`);
  
  // Test command with timeout
  const timeoutResult = await runCommand.execute({ 
    command: 'sleep 0.1 && echo "Done"',
    timeout: 5000
  }) as { exitCode: number; stdout: string; timedOut: boolean };
  
  if (timeoutResult.timedOut) {
    throw new Error('Command unexpectedly timed out');
  }
  console.log(`  Timeout test passed`);
}

// ============================================
// TEST 9: Git Tool
// ============================================
async function testGitTool(): Promise<void> {
  const tools = await loadTools();
  const git = tools.get('git')!;
  
  // Test status (note: operation, not action)
  const statusResult = await git.execute({ operation: 'status', cwd: '/workspace' });
  const status = statusResult as { operation: string; success: boolean; output: string; error?: string };
  
  console.log(`  Operation: ${status.operation}`);
  console.log(`  Success: ${status.success}`);
  console.log(`  Output lines: ${status.output.split('\n').length}`);
  
  // Test log
  const logResult = await git.execute({ operation: 'log', cwd: '/workspace' });
  const log = logResult as { operation: string; success: boolean; output: string };
  
  if (log.success && log.output) {
    const commits = log.output.split('\n').filter(Boolean);
    console.log(`  Recent commits: ${commits.length}`);
    console.log(`  Latest: ${commits[0]?.slice(0, 60)}...`);
  }
}

// ============================================
// TEST 10: LLM Simple Response
// ============================================
async function testLLMSimpleResponse(): Promise<void> {
  const provider = createProvider();
  
  const response = await provider.generateResponse(
    'You are a helpful coding assistant. Be concise.',
    [{ role: 'user', content: 'What is 2 + 2? Reply with just the number.' }]
  );
  
  console.log(`  Response: "${response.trim()}"`);
  
  if (!response.includes('4')) {
    throw new Error('LLM did not respond correctly to simple math');
  }
}

// ============================================
// TEST 11: LLM Tool Call Format
// ============================================
async function testLLMToolCallFormat(): Promise<void> {
  const provider = createProvider();
  
  const systemPrompt = `You are a coding assistant with access to tools.
When asked to read a file, respond ONLY with this JSON format:
{"tool": "readFiles", "args": {"paths": ["<filename>"]}}

When you don't need a tool, respond with:
{"tool": "none", "message": "Your response here"}`;

  const response = await provider.generateResponse(
    systemPrompt,
    [{ role: 'user', content: 'Please read the file package.json' }]
  );
  
  console.log(`  Raw response: ${response.slice(0, 200)}...`);
  
  // Parse JSON
  const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM did not respond with JSON tool format');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  console.log(`  Parsed tool: ${parsed.tool}`);
  console.log(`  Args: ${JSON.stringify(parsed.args)}`);
  
  if (parsed.tool !== 'readFiles') {
    throw new Error(`Expected readFiles tool, got: ${parsed.tool}`);
  }
}

// ============================================
// TEST 12: Multi-Turn Conversation
// ============================================
async function testMultiTurnConversation(): Promise<void> {
  const provider = createProvider();
  const systemPrompt = 'You are a helpful assistant. Be concise.';
  
  const history: Array<{ role: string; content: string }> = [];
  
  // Turn 1
  history.push({ role: 'user', content: 'My name is Alice.' });
  const response1 = await provider.generateResponse(systemPrompt, history);
  history.push({ role: 'assistant', content: response1 });
  console.log(`  Turn 1: User -> "My name is Alice"`);
  console.log(`  Turn 1: Assistant -> "${response1.slice(0, 100)}..."`);
  
  // Turn 2 - Test memory
  history.push({ role: 'user', content: 'What is my name?' });
  const response2 = await provider.generateResponse(systemPrompt, history);
  history.push({ role: 'assistant', content: response2 });
  console.log(`  Turn 2: User -> "What is my name?"`);
  console.log(`  Turn 2: Assistant -> "${response2.slice(0, 100)}..."`);
  
  if (!response2.toLowerCase().includes('alice')) {
    throw new Error('LLM did not remember context from previous turn');
  }
  
  console.log(`  ✓ Context maintained across ${history.length / 2} turns`);
}

// ============================================
// TEST 13: Code Generation
// ============================================
async function testCodeGeneration(): Promise<void> {
  const provider = createProvider();
  
  const prompt = `Write a simple TypeScript function that calculates the factorial of a number.
The function should be called 'factorial' and take a number parameter.
Return ONLY the code, no explanations.`;

  const response = await provider.generateResponse(
    'You are a coding assistant. Return only code, no markdown.',
    [{ role: 'user', content: prompt }]
  );
  
  console.log(`  Generated code:\n${response.slice(0, 500)}`);
  
  // Basic validation
  if (!response.includes('factorial') || !response.includes('function')) {
    throw new Error('Generated code does not contain expected elements');
  }
}

// ============================================
// TEST 14: Edit Block Parsing
// ============================================
async function testEditBlockParsing(): Promise<void> {
  const response = `I'll update the greeting function.

<thought>Need to change the greeting message</thought>

test.ts
<<<<<<< SEARCH
function greet() {
  return "Hello";
}
=======
function greet() {
  return "Hello, World!";
}
>>>>>>> REPLACE

This changes the greeting to be more complete.`;

  const blocks = parseEditBlocks(response);
  
  if (blocks.length !== 1) {
    throw new Error(`Expected 1 edit block, got ${blocks.length}`);
  }
  
  const block = blocks[0];
  console.log(`  File: ${block.file}`);
  console.log(`  Search: "${block.search.slice(0, 50)}..."`);
  console.log(`  Replace: "${block.replace.slice(0, 50)}..."`);
  
  if (block.file !== 'test.ts') {
    throw new Error('Incorrect file parsed');
  }
}

// ============================================
// TEST 15: Fuzzy Edit Matching
// ============================================
async function testFuzzyEditMatching(): Promise<void> {
  // Test with slightly different whitespace
  const original = `function hello() {
    console.log("world");
}`;

  // The search has different indentation
  const result = applyEdit(
    original,
    'console.log("world")',  // Simplified search
    'console.log("universe")'
  );
  
  console.log(`  Method: ${result.method}`);
  console.log(`  Success: ${result.success}`);
  
  if (!result.success) {
    throw new Error('Fuzzy matching failed');
  }
  
  // Note: applyEdit returns { success, content, method, suggestion? }
  if (!result.content?.includes('universe')) {
    throw new Error('Edit was not applied correctly');
  }
  
  console.log(`  Result contains "universe": ✓`);
}

// ============================================
// TEST 16: Full Agent Loop Simulation
// ============================================
async function testAgentLoopSimulation(): Promise<void> {
  await setupTestDir();
  
  const provider = createProvider();
  const tools = await loadTools();
  
  const systemPrompt = `You are Simple-CLI, an agentic coding assistant.

## Tools Available
- readFiles: Read file contents. Args: {paths: ["file1", "file2"]}
- writeFiles: Write files. Args: {files: [{path: "file", content: "..."}]}

## Response Format
<thought>Your reasoning here</thought>
{"tool": "toolName", "args": {...}}

When done with the task, respond with:
{"tool": "none", "message": "Task complete"}`;

  // Simulate a simple task
  const userMessage = `Create a new file at ${TEST_DIR}/hello.ts with a simple hello world function.`;
  
  console.log(`  User: "${userMessage}"`);
  
  const response = await provider.generateResponse(systemPrompt, [
    { role: 'user', content: userMessage }
  ]);
  
  console.log(`  Agent response:\n${response.slice(0, 400)}...`);
  
  // Parse thought
  const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    console.log(`  Thought: "${thoughtMatch[1].slice(0, 100)}..."`);
  }
  
  // Parse action
  const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No tool action in response');
  }
  
  // Use jsonrepair to handle malformed JSON from LLM
  const { jsonrepair } = await import('jsonrepair');
  let action;
  try {
    const repaired = jsonrepair(jsonMatch[0]);
    action = JSON.parse(repaired);
  } catch (e) {
    console.log(`  Raw JSON: ${jsonMatch[0].slice(0, 200)}`);
    throw new Error(`JSON parse failed: ${e}`);
  }
  console.log(`  Action: ${action.tool}`);
  
  // Execute the tool if it's writeFiles
  if (action.tool === 'writeFiles' && action.args) {
    const writeFiles = tools.get('writeFiles')!;
    const result = await writeFiles.execute(action.args);
    console.log(`  Executed tool: ${JSON.stringify(result)}`);
  }
}

// ============================================
// TEST 17: Complex Code Understanding
// ============================================
async function testCodeUnderstanding(): Promise<void> {
  const provider = createProvider();
  
  const code = `
interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];
  
  addUser(user: User): void {
    this.users.push(user);
  }
  
  findById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
  
  removeUser(id: number): boolean {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}`;

  const prompt = `Analyze this TypeScript code and list:
1. The interface name and its properties
2. The class name and its methods
3. Any potential improvements

Code:
${code}`;

  const response = await provider.generateResponse(
    'You are a code review assistant. Be thorough but concise.',
    [{ role: 'user', content: prompt }]
  );
  
  console.log(`  Analysis:\n${response.slice(0, 800)}...`);
  
  // Verify it mentions key elements
  const mentions = ['User', 'UserService', 'addUser', 'findById', 'removeUser'];
  const found = mentions.filter(m => response.includes(m));
  
  console.log(`  Identified ${found.length}/${mentions.length} code elements`);
  
  if (found.length < 4) {
    throw new Error('LLM did not adequately analyze the code');
  }
}

// ============================================
// TEST 18: Error Recovery Prompt
// ============================================
async function testErrorRecoveryPrompt(): Promise<void> {
  const provider = createProvider();
  
  const systemPrompt = `You are a coding assistant. When given an error, suggest a fix.`;
  
  const errorMessage = `Error in file src/utils.ts:
TypeError: Cannot read property 'map' of undefined
  at processItems (src/utils.ts:15:23)
  
The code at line 15 is:
  return items.map(item => item.id);`;

  const response = await provider.generateResponse(systemPrompt, [
    { role: 'user', content: `I got this error. How do I fix it?\n\n${errorMessage}` }
  ]);
  
  console.log(`  Recovery suggestion:\n${response.slice(0, 500)}...`);
  
  // Should mention null/undefined check or optional chaining
  const hasCheck = response.includes('undefined') || 
                   response.includes('null') || 
                   response.includes('?.') ||
                   response.includes('if (');
  
  if (!hasCheck) {
    throw new Error('LLM did not suggest proper error handling');
  }
  
  console.log(`  ✓ Suggested null/undefined handling`);
}

// ============================================
// TEST 19: Memory Tool
// ============================================
async function testMemoryTool(): Promise<void> {
  const tools = await loadTools();
  const memory = tools.get('memory')!;
  
  // Store a value (note: operation, not action)
  await memory.execute({ 
    operation: 'set', 
    key: 'test_key', 
    value: 'test_value_123' 
  });
  console.log(`  Stored: test_key = "test_value_123"`);
  
  // Retrieve the value
  const result = await memory.execute({ 
    operation: 'get', 
    key: 'test_key' 
  });
  
  const memResult = result as { operation: string; success: boolean; data?: { key: string; value: string } };
  console.log(`  Retrieved: ${JSON.stringify(memResult)}`);
  
  if (memResult.data?.value !== 'test_value_123') {
    throw new Error('Memory value mismatch');
  }
  
  // List keys
  const listResult = await memory.execute({ operation: 'list' });
  console.log(`  Keys: ${JSON.stringify(listResult)}`);
  
  // Cleanup
  await memory.execute({ operation: 'delete', key: 'test_key' });
}

// ============================================
// TEST 20: Stress Test - Long Response
// ============================================
async function testLongResponse(): Promise<void> {
  const provider = createProvider();
  
  const prompt = `Write a detailed explanation of how a JavaScript event loop works.
Include:
1. Call stack
2. Callback queue
3. Microtask queue
4. How setTimeout works
5. How Promises work
Be thorough.`;

  const response = await provider.generateResponse(
    'You are a technical educator. Explain concepts clearly.',
    [{ role: 'user', content: prompt }]
  );
  
  console.log(`  Response length: ${response.length} characters`);
  console.log(`  First 500 chars:\n${response.slice(0, 500)}...`);
  
  if (response.length < 500) {
    throw new Error('Response too short for a detailed explanation');
  }
  
  // Check for key concepts
  const concepts = ['stack', 'queue', 'Promise', 'setTimeout'];
  const found = concepts.filter(c => response.toLowerCase().includes(c.toLowerCase()));
  console.log(`  Mentioned ${found.length}/${concepts.length} key concepts`);
}

// ============================================
// TEST 21: End-to-End Coding Task
// ============================================
async function testEndToEndCodingTask(): Promise<void> {
  await setupTestDir();
  
  const provider = createProvider();
  const tools = await loadTools();
  
  // Simpler task with direct code generation instead of agent loop
  const task = `Write TypeScript code for a utility module with these 3 functions:
1. capitalize(str: string): string - capitalizes the first letter
2. reverseString(str: string): string - reverses a string
3. isPalindrome(str: string): boolean - checks if palindrome

Return ONLY the TypeScript code, no explanations. Include JSDoc comments.`;

  console.log(`  Task: Generate utility module with 3 functions`);
  
  const response = await provider.generateResponse(
    'You are a TypeScript developer. Return only code.',
    [{ role: 'user', content: task }]
  );
  
  console.log(`  Response length: ${response.length} chars`);
  
  // Extract code from potential markdown fence
  let code = response;
  const codeMatch = response.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    code = codeMatch[1].trim();
  }
  
  // Write the generated code to file
  const writeFiles = tools.get('writeFiles')!;
  await writeFiles.execute({
    files: [{ path: join(TEST_DIR, 'utils.ts'), content: code }]
  });
  
  // Verify the file was created and contains expected functions
  const content = await readFile(join(TEST_DIR, 'utils.ts'), 'utf-8');
  
  const checks = [
    content.includes('capitalize'),
    content.includes('reverseString'),
    content.includes('isPalindrome'),
    content.includes('string'),
    content.includes('boolean'),
  ];
  
  const passedChecks = checks.filter(Boolean).length;
  console.log(`  Generated ${content.split('\n').length} lines of code`);
  console.log(`  Contains expected elements: ${passedChecks}/${checks.length}`);
  console.log(`  Sample: ${content.slice(0, 200)}...`);
  
  if (passedChecks < 4) {
    throw new Error('Generated code missing expected functions');
  }
}

// ============================================
// TEST 22: Complex Multi-Step Reasoning
// ============================================
async function testComplexReasoning(): Promise<void> {
  const provider = createProvider();
  
  const problem = `Analyze this code and identify the bug:

\`\`\`javascript
function findDuplicates(arr) {
  const seen = {};
  const duplicates = [];
  
  for (let i = 0; i <= arr.length; i++) {
    if (seen[arr[i]]) {
      duplicates.push(arr[i]);
    }
    seen[arr[i]] = true;
  }
  
  return duplicates;
}

// Test case that fails:
// findDuplicates([1, 2, 3, 2, 4, 3]) should return [2, 3]
// But it returns [2, 3, undefined]
\`\`\`

Explain the bug and provide the corrected code.`;

  const response = await provider.generateResponse(
    'You are a code debugging expert. Analyze bugs carefully and provide clear explanations.',
    [{ role: 'user', content: problem }]
  );
  
  console.log(`  Response length: ${response.length} chars`);
  
  // Check that the response identifies the off-by-one error
  const identifiesBug = 
    (response.includes('<=') && response.includes('<')) ||
    response.toLowerCase().includes('off-by-one') ||
    response.toLowerCase().includes('boundary') ||
    response.includes('i < arr.length');
  
  console.log(`  Identified bug: ${identifiesBug ? '✓' : '✗'}`);
  
  if (!identifiesBug) {
    throw new Error('LLM did not identify the off-by-one error');
  }
}

// ============================================
// TEST 23: Refactoring Task
// ============================================
async function testRefactoringTask(): Promise<void> {
  await setupTestDir();
  
  const provider = createProvider();
  
  // Create initial messy code
  const messyCode = `
function processData(d) {
  var result = [];
  for (var i = 0; i < d.length; i++) {
    if (d[i].active == true) {
      if (d[i].age > 18) {
        result.push({name: d[i].name, email: d[i].email, status: 'adult'});
      } else {
        result.push({name: d[i].name, email: d[i].email, status: 'minor'});
      }
    }
  }
  return result;
}`;

  const task = `Refactor this JavaScript code to modern ES6+ standards:
${messyCode}

Requirements:
- Use const/let instead of var
- Use arrow functions where appropriate
- Use array methods (filter, map) instead of manual loops
- Use template literals if needed
- Use strict equality (===)
- Add TypeScript types`;

  const response = await provider.generateResponse(
    'You are a senior developer. Refactor code to be clean, modern, and type-safe.',
    [{ role: 'user', content: task }]
  );
  
  console.log(`  Refactored code generated`);
  
  // Check for modern patterns
  const hasConst = response.includes('const ') || response.includes('let ');
  const hasArrow = response.includes('=>');
  const hasFilter = response.includes('.filter');
  const hasMap = response.includes('.map');
  const hasTypes = response.includes(': ') && response.includes('interface');
  
  const modernFeatures = [hasConst, hasArrow, hasFilter, hasMap, hasTypes].filter(Boolean).length;
  console.log(`  Modern features used: ${modernFeatures}/5`);
  
  if (modernFeatures < 3) {
    throw new Error('Refactoring did not use enough modern features');
  }
}

// ============================================
// TEST 24: API Design Task
// ============================================
async function testAPIDesign(): Promise<void> {
  const provider = createProvider();
  
  const task = `Design a REST API for a todo list application.
Include:
1. Resource endpoints (CRUD operations)
2. Request/Response formats (JSON)
3. Status codes for each endpoint
4. Authentication approach (brief)

Be concise but complete. Format as a markdown table.`;

  const response = await provider.generateResponse(
    'You are an API architect. Design clean, RESTful APIs.',
    [{ role: 'user', content: task }]
  );
  
  console.log(`  API design generated (${response.length} chars)`);
  
  // Check for essential REST concepts
  const concepts = ['GET', 'POST', 'PUT', 'DELETE', '/todos', '200', '201', '404'];
  const found = concepts.filter(c => response.includes(c)).length;
  
  console.log(`  REST concepts covered: ${found}/${concepts.length}`);
  
  if (found < 5) {
    throw new Error('API design missing essential REST concepts');
  }
}

// ============================================
// TEST 25: Test Generation
// ============================================
async function testTestGeneration(): Promise<void> {
  const provider = createProvider();
  
  const codeToTest = `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  
  subtract(a: number, b: number): number {
    return a - b;
  }
  
  multiply(a: number, b: number): number {
    return a * b;
  }
  
  divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}`;

  const task = `Write unit tests for this Calculator class using Jest or Vitest.
Include:
- Tests for each method
- Edge cases (division by zero)
- Positive and negative numbers

${codeToTest}`;

  const response = await provider.generateResponse(
    'You are a test engineer. Write comprehensive, well-structured unit tests.',
    [{ role: 'user', content: task }]
  );
  
  console.log(`  Tests generated (${response.length} chars)`);
  
  // Check for test patterns
  const testPatterns = [
    'describe',
    'it(',
    'expect',
    'toBe',
    'toThrow',
    'add',
    'divide',
    '0'
  ];
  const found = testPatterns.filter(p => response.includes(p)).length;
  
  console.log(`  Test patterns found: ${found}/${testPatterns.length}`);
  
  if (found < 5) {
    throw new Error('Generated tests missing essential patterns');
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 SIMPLE-CLI COMPREHENSIVE LIVE TEST SUITE');
  console.log('═'.repeat(60));
  
  const startTime = Date.now();
  
  // Run all tests
  await runTest('Environment & Provider Setup', testEnvironment);
  await runTest('Tool Loading', testToolLoading);
  await runTest('ReadFiles Tool', testReadFilesTool);
  await runTest('WriteFiles Tool', testWriteFilesTool);
  await runTest('Search/Replace Edit', testSearchReplaceEdit);
  await runTest('Glob Tool', testGlobTool);
  await runTest('Grep Tool', testGrepTool);
  await runTest('RunCommand Tool', testRunCommandTool);
  await runTest('Git Tool', testGitTool);
  await runTest('LLM Simple Response', testLLMSimpleResponse);
  await runTest('LLM Tool Call Format', testLLMToolCallFormat);
  await runTest('Multi-Turn Conversation', testMultiTurnConversation);
  await runTest('Code Generation', testCodeGeneration);
  await runTest('Edit Block Parsing', testEditBlockParsing);
  await runTest('Fuzzy Edit Matching', testFuzzyEditMatching);
  await runTest('Agent Loop Simulation', testAgentLoopSimulation);
  await runTest('Code Understanding', testCodeUnderstanding);
  await runTest('Error Recovery Prompt', testErrorRecoveryPrompt);
  await runTest('Memory Tool', testMemoryTool);
  await runTest('Long Response Generation', testLongResponse);
  
  // Advanced tests
  await runTest('End-to-End Coding Task', testEndToEndCodingTask);
  await runTest('Complex Reasoning (Bug Detection)', testComplexReasoning);
  await runTest('Refactoring Task', testRefactoringTask);
  await runTest('API Design', testAPIDesign);
  await runTest('Test Generation', testTestGeneration);
  
  // Cleanup
  await cleanupTestDir();
  
  // Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Duration: ${(totalTime / 1000).toFixed(2)}s`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
