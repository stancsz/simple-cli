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

    // Real LLM Integration
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.LITELLM_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.CLAW_MODEL || 'gpt-4';

    if (!apiKey) {
        console.warn('⚠️  No API key found. Falling back to template generation.');
        return fallbackTemplate(intent);
    }

    const prompt = `You are an expert at generating specialized agent personas. Create a detailed AGENT.md file for an AI agent whose sole purpose is: "${intent}"

The AGENT.md should include:
1. A persona description (who is this agent, what expertise does it have)
2. A strategy section (how it will approach the task)
3. Constraints (what it should NOT do)

Format it in Markdown with proper headers. Be specific and actionable.`;

    try {
        const https = require('https');
        const url = new URL(`${baseUrl}/chat/completions`);

        const body = JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1000
        });

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.choices && json.choices[0]) {
                            resolve(json.choices[0].message.content);
                        } else {
                            console.error('Unexpected API response:', json);
                            resolve(fallbackTemplate(intent));
                        }
                    } catch (e) {
                        console.error('Failed to parse LLM response:', e);
                        resolve(fallbackTemplate(intent));
                    }
                });
            });

            req.on('error', (e) => {
                console.error('LLM request failed:', e.message);
                resolve(fallbackTemplate(intent));
            });

            req.write(body);
            req.end();
        });
    } catch (error) {
        console.error('Error calling LLM:', error);
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
