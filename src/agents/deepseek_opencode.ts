import { spawn } from 'child_process';
import process from 'process';

async function main() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('Error: DEEPSEEK_API_KEY environment variable is not set.');
        process.exit(1);
    }

    const userArgs = process.argv.slice(2);

    // Construct arguments for opencode
    // Attempt to run opencode using npx with environment variables for DeepSeek
    // Many tools support OpenAI-compatible env vars: OPENAI_API_KEY and OPENAI_BASE_URL

    // WARNING: The 'opencode' package does not appear to exist in the public npm registry.
    // This agent might require a specific private package or a local installation.
    const opencodeArgs = [
        'opencode',
        ...userArgs
    ];

    console.log(`[DeepSeek+OpenCode] Starting opencode with DeepSeek configuration...`);

    // Use shell: true to resolve npx correctly
    const child = spawn('npx', opencodeArgs, {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            // Map DeepSeek to OpenAI standard env vars for compatibility
            OPENAI_API_KEY: apiKey,
            OPENAI_BASE_URL: 'https://api.deepseek.com',
            // Also set DEEPSEEK_API_KEY just in case the tool supports it natively
            DEEPSEEK_API_KEY: apiKey
        }
    });

    child.on('exit', (code) => {
        process.exit(code ?? 0);
    });

    child.on('error', (err) => {
        console.error(`[DeepSeek+OpenCode] Failed to start opencode: ${err.message}`);
        process.exit(1);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
