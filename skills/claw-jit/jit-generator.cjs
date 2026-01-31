/**
 * [Simple-CLI AI-Created]
 * JIT Agent Generator Implementation
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

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

    // TODO: connect to actual LLM here. For MVP/Demo, we use a template generator.
    // In a real implementation this would call OpenAI/Anthropic API.

    const rules = [
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

    return rules;
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
