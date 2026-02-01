/**
 * [Simple-CLI AI-Created]
 * JIT Agent Generator Implementation
 * Uses the main CLI's provider system - no reimplementation!
 */
import fs from 'fs';
import path from 'path';

const INTENT = process.env.INPUT_INTENT || process.argv[2];
if (!INTENT) {
    console.error('Error: INTENT is required');
    process.exit(1);
}

const PROJECT_ROOT = process.env.CLAW_PROJECT_ROOT || process.cwd();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.simple', 'workdir', 'memory');
const AGENT_FILE = path.join(PROJECT_ROOT, '.simple', 'workdir', 'AGENT.md');

// Ensure directories exist
if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(path.join(MEMORY_DIR, 'notes'), { recursive: true });
    fs.mkdirSync(path.join(MEMORY_DIR, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(MEMORY_DIR, 'reflections'), { recursive: true });
    fs.mkdirSync(path.join(MEMORY_DIR, 'graph'), { recursive: true });
    console.log('Creates memory structure at .simple/workdir/memory/');
}

async function generatePersona(intent) {
    // fast path for testing without API keys
    if (process.env.TEST_MODE === 'true') {
        return `# AGENT.md: ${intent}\n\n## Persona\nExpert for ${intent}.\n\n## Constraints\n- Test Mode active.`;
    }

    // Import the main provider system - reuse, don't reimplement!
    try {
        const realProjectRoot = process.env.REAL_PROJECT_ROOT || PROJECT_ROOT;
        const providerPath = path.join(realProjectRoot, 'dist', 'providers', 'index.js');
        const { createProvider } = await import('file://' + providerPath.replace(/\\/g, '/'));
        const provider = createProvider();

        const prompt = `You are an expert at generating specialized agent personas. Create a detailed AGENT.md file for an AI agent whose sole purpose is: "${intent}"

The AGENT.md should include:
1. A persona description (who is this agent, what expertise does it have)
2. A strategy section (how it will approach the task)
3. Constraints (what it should NOT do)

Format it in Markdown with proper headers. Be specific and actionable.`;

        console.log('Calling LLM for persona generation...');
        const response = await provider.generateResponse('You are a helpful assistant.', [
            { role: 'user', content: prompt }
        ]);
        console.log('LLM response received.');

        return response || fallbackTemplate(intent);
    } catch (error) {
        console.error('Error calling LLM:', error.message);
        return fallbackTemplate(intent);
    }
}

function fallbackTemplate(intent) {
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

(async () => {
    try {
        console.log(`Generating JIT Agent for intent: "${INTENT}"...`);

        // 1. Generate Content
        const content = await generatePersona(INTENT);

        // 2. Write File
        const workdir = path.dirname(AGENT_FILE);
        if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });

        fs.writeFileSync(AGENT_FILE, content);
        console.log(`Successfully wrote specialized agent rules to ${AGENT_FILE}`);

        // 3. Log to memory
        const logFile = path.join(MEMORY_DIR, 'logs', `jit-${Date.now()}.log`);
        fs.writeFileSync(logFile, `[INIT] Generated agent for intent: ${INTENT}\n`);

    } catch (error) {
        console.error('Failed to generate agent:', error);
        process.exit(1);
    }
})();
