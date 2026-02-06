import { ContextManager, getContextManager } from '../context.js';
import { createProvider } from '../providers/index.js';

export async function runGhostLoop(prompt: string, ctx?: ContextManager): Promise<string> {
  const provider = createProvider();
  const context = ctx || getContextManager(); // Re-use global context or provided one

  // Add User Message
  context.addMessage('user', prompt);

  // Simple Loop (limit to 10 steps for safety in worker mode)
  let steps = 0;
  const maxSteps = 10;
  let finalOutput = '';

  try {
    while (steps < maxSteps) {
      // Generate
      const fullPrompt = await context.buildSystemPrompt();
      const history = context.getHistory();
      const response = await provider.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));

      const { thought, tool, args, message } = response;

      if (thought) {
        finalOutput += `[Thought] ${thought}\n`;
      }

      if (tool && tool !== 'none') {
        const toolDef = context.getTools().get(tool);
        if (toolDef) {
          try {
            const result = await toolDef.execute(args || {});
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            context.addMessage('assistant', JSON.stringify(response));
            context.addMessage('user', `Tool result: ${resultStr}`);
            finalOutput += `[Tool: ${tool}] Result: ${resultStr}\n`;
          } catch (err: any) {
            context.addMessage('user', `Tool error: ${err.message}`);
            finalOutput += `[Tool: ${tool}] Error: ${err.message}\n`;
          }
        } else {
          context.addMessage('user', `Error: Tool ${tool} not found`);
          finalOutput += `[Error] Tool ${tool} not found\n`;
        }
        steps++;
      } else {
        // Final message
        if (message) {
          finalOutput += `[Response] ${message}\n`;
          context.addMessage('assistant', message);
        }
        break;
      }
    }
  } catch (e: any) {
    finalOutput += `[Fatal Error] ${e.message}\n`;
  }

  return finalOutput;
}
