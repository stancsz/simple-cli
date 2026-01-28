/**
 * Agent Core - Main agent loop with reflection and retry
 * Implements Aider-style reasoning and error recovery
 */

import { Message } from '../context.js';
import { EditBlock, applyFileEdits, parseEditBlocks, EditResult } from './editor.js';
import { GitManager, generateCommitMessage } from './git.js';
import * as ui from './ui.js';

export interface AgentConfig {
  maxReflections: number;
  autoLint: boolean;
  autoTest: boolean;
  autoCommit: boolean;
  testCommand?: string;
  lintCommand?: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentResponse {
  thought?: string;
  action: ToolCall | { tool: 'none'; message: string };
  editBlocks?: EditBlock[];
}

export interface ReflectionContext {
  attempt: number;
  previousError: string;
  previousResponse: string;
  failedEdits: EditResult[];
}

/**
 * Parse LLM response into structured format
 */
export function parseResponse(response: string): AgentResponse {
  // Extract thought/reasoning
  const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/i);
  const thought = thoughtMatch?.[1]?.trim();

  // Extract edit blocks
  const editBlocks = parseEditBlocks(response);

  // Extract tool action
  const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  let action: AgentResponse['action'] = { tool: 'none', message: 'No action parsed' };

  if (jsonMatch) {
    try {
      action = JSON.parse(jsonMatch[0]);
    } catch {
      // Keep default
    }
  }

  return { thought, action, editBlocks };
}

/**
 * Build reflection prompt for retry
 */
export function buildReflectionPrompt(context: ReflectionContext): string {
  let prompt = `## Reflection (Attempt ${context.attempt})

Your previous response had errors that need to be fixed.

### Previous Error
${context.previousError}

`;

  if (context.failedEdits.length > 0) {
    prompt += `### Failed Edits\n`;
    for (const edit of context.failedEdits) {
      prompt += `
**File:** ${edit.file}
**Error:** ${edit.error}
${edit.suggestion ? `**Suggestion:** ${edit.suggestion}` : ''}
`;
    }
  }

  prompt += `
### Instructions
- Review the error carefully
- The SEARCH block must EXACTLY match existing content
- Include enough context to make the match unique
- Try again with corrected SEARCH/REPLACE blocks
`;

  return prompt;
}

/**
 * Build lint error prompt
 */
export function buildLintErrorPrompt(file: string, errors: string): string {
  return `## Lint Errors Detected

The file \`${file}\` has syntax errors after your changes:

\`\`\`
${errors}
\`\`\`

Please fix these errors by providing corrected SEARCH/REPLACE blocks.
Focus on the specific lines mentioned in the errors.
`;
}

/**
 * Build test failure prompt
 */
export function buildTestFailurePrompt(output: string): string {
  return `## Test Failure

The tests failed after your changes:

\`\`\`
${output.slice(0, 2000)}${output.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`

Please analyze the failure and fix the code.
Provide SEARCH/REPLACE blocks for the necessary changes.
`;
}

/**
 * Agent class - Main orchestration logic
 */
export class Agent {
  private config: AgentConfig;
  private git: GitManager;
  private generateFn: (messages: Message[]) => Promise<string>;
  private executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  private lintFn?: (file: string) => Promise<{ passed: boolean; output: string }>;
  private testFn?: () => Promise<{ passed: boolean; output: string }>;

  constructor(options: {
    config: AgentConfig;
    git: GitManager;
    generateFn: (messages: Message[]) => Promise<string>;
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    lintFn?: (file: string) => Promise<{ passed: boolean; output: string }>;
    testFn?: () => Promise<{ passed: boolean; output: string }>;
  }) {
    this.config = options.config;
    this.git = options.git;
    this.generateFn = options.generateFn;
    this.executeTool = options.executeTool;
    this.lintFn = options.lintFn;
    this.testFn = options.testFn;
  }

  /**
   * Process a user message with reflection loop
   */
  async process(
    userMessage: string,
    history: Message[],
    systemPrompt: string
  ): Promise<{
    response: AgentResponse;
    editResults: EditResult[];
    lintResults: Array<{ file: string; passed: boolean; output: string }>;
    testResult?: { passed: boolean; output: string };
    commitResult?: { hash: string; message: string };
  }> {
    let messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    let attempt = 0;
    let editResults: EditResult[] = [];
    let lintResults: Array<{ file: string; passed: boolean; output: string }> = [];
    let testResult: { passed: boolean; output: string } | undefined;
    let commitResult: { hash: string; message: string } | undefined;

    while (attempt < this.config.maxReflections) {
      attempt++;

      // Generate response
      const llmResponse = await ui.spin(
        attempt === 1 ? 'Thinking...' : `Reflecting (attempt ${attempt})...`,
        () => this.generateFn(messages)
      );

      // Parse response
      const response = parseResponse(llmResponse);

      // Show thought if present
      if (response.thought) {
        ui.showThought(response.thought);
      }

      // Apply edit blocks if present
      if (response.editBlocks && response.editBlocks.length > 0) {
        ui.step(`Applying ${response.editBlocks.length} edit(s)...`);
        editResults = await applyFileEdits(response.editBlocks);

        const failed = editResults.filter(r => !r.success);
        const succeeded = editResults.filter(r => r.success);

        // Show results
        for (const result of succeeded) {
          ui.success(`✓ ${result.file}`);
          if (result.diff) {
            ui.showDiff(result.diff);
          }
        }

        for (const result of failed) {
          ui.error(`✗ ${result.file}: ${result.error}`);
          if (result.suggestion) {
            ui.note(result.suggestion, 'Suggestion');
          }
        }

        // If any edits failed, reflect and retry
        if (failed.length > 0 && attempt < this.config.maxReflections) {
          const reflectionPrompt = buildReflectionPrompt({
            attempt,
            previousError: failed.map(f => f.error).join('\n'),
            previousResponse: llmResponse,
            failedEdits: failed,
          });

          messages = [
            ...messages,
            { role: 'assistant', content: llmResponse },
            { role: 'user', content: reflectionPrompt },
          ];
          continue;
        }

        // Run linting if enabled and edits succeeded
        if (this.config.autoLint && this.lintFn && succeeded.length > 0) {
          const filesToLint = [...new Set(succeeded.map(r => r.file))];

          for (const file of filesToLint) {
            const lintResult = await ui.spin(
              `Linting ${file}...`,
              () => this.lintFn!(file)
            );
            lintResults.push({ file, ...lintResult });

            if (!lintResult.passed && attempt < this.config.maxReflections) {
              ui.error(`Lint errors in ${file}`);

              const lintPrompt = buildLintErrorPrompt(file, lintResult.output);
              messages = [
                ...messages,
                { role: 'assistant', content: llmResponse },
                { role: 'user', content: lintPrompt },
              ];
              continue;
            }
          }
        }

        // Run tests if enabled
        if (this.config.autoTest && this.testFn && succeeded.length > 0) {
          testResult = await ui.spin('Running tests...', () => this.testFn!());

          if (!testResult.passed && attempt < this.config.maxReflections) {
            ui.error('Tests failed');

            const testPrompt = buildTestFailurePrompt(testResult.output);
            messages = [
              ...messages,
              { role: 'assistant', content: llmResponse },
              { role: 'user', content: testPrompt },
            ];
            continue;
          }
        }

        // Auto-commit if enabled and all checks passed
        if (this.config.autoCommit && succeeded.length > 0) {
          const allLintsPassed = lintResults.every(r => r.passed);
          const testsPassed = !testResult || testResult.passed;

          if (allLintsPassed && testsPassed) {
            const diff = await this.git.diff();
            if (diff) {
              const commitMessage = await ui.spin(
                'Generating commit message...',
                () => generateCommitMessage(diff, async (prompt) => {
                  const result = await this.generateFn([
                    { role: 'user', content: prompt },
                  ]);
                  return result;
                })
              );

              commitResult = await this.git.commit({
                message: commitMessage,
                files: succeeded.map(r => r.file),
              }) || undefined;

              if (commitResult) {
                ui.success(`Committed: ${commitResult.hash} ${commitResult.message}`);
              }
            }
          }
        }
      }

      // Execute tool action if not edit blocks
      if (response.action && 'tool' in response.action && response.action.tool !== 'none' && !response.editBlocks?.length) {
        const { tool, args } = response.action as ToolCall;
        ui.showToolCall(tool, args || {});

        try {
          const result = await this.executeTool(tool, args || {});
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          ui.showToolResult(resultStr);
        } catch (error) {
          ui.error(`Tool error: ${error instanceof Error ? error.message : error}`);
        }
      }

      return { response, editResults, lintResults, testResult, commitResult };
    }

    // Max reflections reached
    ui.warning(`Max reflections (${this.config.maxReflections}) reached`);
    return {
      response: { action: { tool: 'none', message: 'Max reflections reached' } },
      editResults,
      lintResults,
      testResult,
      commitResult,
    };
  }
}

/**
 * Summarize conversation history to reduce tokens
 */
export async function summarizeHistory(
  history: Message[],
  generateFn: (messages: Message[]) => Promise<string>,
  maxMessages: number = 10
): Promise<Message[]> {
  if (history.length <= maxMessages) {
    return history;
  }

  // Keep first message (usually important context) and last few messages
  const keepFirst = 1;
  const keepLast = maxMessages - 2;
  const toSummarize = history.slice(keepFirst, -keepLast);

  if (toSummarize.length === 0) {
    return history;
  }

  const summaryPrompt = `Summarize this conversation history concisely, preserving key information:

${toSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')}

Provide a brief summary that captures:
1. Main topics discussed
2. Key decisions made
3. Important context for future messages`;

  const summary = await generateFn([
    { role: 'user', content: summaryPrompt },
  ]);

  return [
    history[0], // Keep first
    { role: 'system', content: `[Conversation Summary]\n${summary}` },
    ...history.slice(-keepLast), // Keep last few
  ];
}
