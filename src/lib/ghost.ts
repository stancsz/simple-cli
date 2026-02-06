import { ContextManager } from '../context.js';
import { createProvider } from '../providers/index.js';

export interface GhostOptions {
  maxSteps?: number;
  env?: Record<string, string>;
}

export async function runGhostLoop(
  prompt: string,
  ctx: ContextManager,
  onLog: (message: string) => void,
  options: GhostOptions = {}
): Promise<void> {
  const maxSteps = options.maxSteps || 15;
  const provider = createProvider();

  onLog(`[Ghost] Starting task: "${prompt}"`);

  // Add user message
  ctx.addMessage('user', prompt);

  let steps = 0;

  try {
    while (steps < maxSteps) {
      const fullPrompt = await ctx.buildSystemPrompt();
      const history = ctx.getHistory();

      // Generate response
      const response = await provider.generateResponse(
        fullPrompt,
        history.map(m => ({ role: m.role, content: m.content }))
      );

      const { thought, tool, args, message } = response;

      if (thought) {
        onLog(`[Thought] ${thought}`);
      }

      if (tool && tool !== 'none') {
        onLog(`[Tool] Executing ${tool}...`);

        const toolDef = ctx.getTools().get(tool);
        if (toolDef) {
          try {
            // Apply any env overrides if needed, though tools usually use process.env
            // We can perhaps temporarily set them if strictly required, but for now we rely on global state

            const result = await toolDef.execute((args || {}) as any);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            onLog(`[Result] ${resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr}`);

            ctx.addMessage('assistant', JSON.stringify(response));
            ctx.addMessage('user', `Tool result: ${resultStr}`);

          } catch (err: any) {
            onLog(`[Error] Tool execution failed: ${err.message}`);
            ctx.addMessage('assistant', JSON.stringify(response));
            ctx.addMessage('user', `Tool error: ${err.message}`);
          }
        } else {
          onLog(`[Error] Tool "${tool}" not found.`);
          ctx.addMessage('assistant', JSON.stringify(response));
          ctx.addMessage('user', `Error: Tool "${tool}" not found`);
        }
        steps++;
      } else {
        // Final message or no tool usage
        if (message) {
          onLog(`[Response] ${message}`);
          ctx.addMessage('assistant', message);
        } else {
           // Fallback if no message and no tool
           const raw = response.raw || JSON.stringify(response);
           onLog(`[Agent] ${raw}`);
           ctx.addMessage('assistant', raw);
        }
        break; // Stop if no tool call
      }
    }

    if (steps >= maxSteps) {
      onLog(`[Ghost] Max steps (${maxSteps}) reached.`);
    } else {
      onLog(`[Ghost] Task completed.`);
    }

  } catch (err: any) {
    onLog(`[Fatal] Ghost loop error: ${err.message}`);
  }
}
