import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { createProvider } from '../providers/index.js';

/**
 * JIT Agent Generation: Task-specific personas
 * Reuse the central provider system - don't reinvent the wheel!
 */
export async function generateJitAgent(intent: string, targetDir: string): Promise<void> {
    const memoryDir = path.join(targetDir, '.simple', 'workdir', 'memory');
    const agentFile = path.join(targetDir, '.simple', 'workdir', 'AGENT.md');

    // Ensure state directories exist
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(path.join(memoryDir, 'notes'), { recursive: true });
        fs.mkdirSync(path.join(memoryDir, 'logs'), { recursive: true });
        fs.mkdirSync(path.join(memoryDir, 'reflections'), { recursive: true });
        fs.mkdirSync(path.join(memoryDir, 'graph'), { recursive: true });
    }

    try {
        const provider = createProvider();

        const prompt = `You are an expert at generating specialized agent personas. Create a detailed AGENT.md file for an AI agent whose sole purpose is: "${intent}"

The AGENT.md should include:
1. A persona description (who is this agent, what expertise does it have)
2. A strategy section (how it will approach the task)
3. Constraints (what it should NOT do)

Format it in Markdown with proper headers. Be specific and actionable.`;


        console.log(pc.dim('  Calling LLM for persona generation...'));

        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('LLM Timeout')), 8000)
        );

        const responsePromise = provider.generateResponse('You are a helpful assistant specialized in agent design.', [
            { role: 'user', content: prompt }
        ]);

        const response = await Promise.race([responsePromise, timeoutPromise]);

        console.log(pc.dim('  LLM response received.'));

        let content: string;
        if (!response || response.startsWith('Error calling LLM:')) {
            console.warn(pc.yellow('⚠️  LLM call failed. Using fallback blueprint.'));
            content = fallbackTemplate(intent);
        } else {
            content = response;
        }

        const workdir = path.dirname(agentFile);
        if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });

        fs.writeFileSync(agentFile, content);
        console.log(pc.green(`✅ JIT Agent persona active: ${path.relative(targetDir, agentFile)}`));

        // Log to memory
        const logFile = path.join(memoryDir, 'logs', `jit-${Date.now()}.log`);
        fs.writeFileSync(logFile, `[INIT] Generated agent for intent: ${intent}\n`);

    } catch (error) {
        console.error(pc.red('Critical error in JIT generation:'), error);
        fs.writeFileSync(agentFile, fallbackTemplate(intent));
    }
}

function fallbackTemplate(intent: string): string {
    return [
        '# 🛡️ JIT AGENT: ' + intent.toUpperCase(),
        '',
        '## 🎭 Persona',
        `You are a specialized agent focused solely on: "${intent}".`,
        'Your goal is to execute this intent with maximum efficiency and zero side effects.',
        '',
        '## 🚀 Strategy',
        '- Analyze the intent deeply.',
        '- Use available tools to gather context.',
        '- Document all findings in `.simple/workdir/memory/notes/`.',
        '- Reflect on your progress in `.simple/workdir/memory/reflections/`.',
        '',
        '## 🔐 Constraints',
        '- Do not modify files outside the scope of the intent.',
        '- Keep the "memory" clean and organized.',
        ''
    ].join('\n');
}
