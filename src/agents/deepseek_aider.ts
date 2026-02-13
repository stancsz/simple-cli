import { spawn } from 'child_process';
import process from 'process';

async function main() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('Error: DEEPSEEK_API_KEY environment variable is not set.');
        process.exit(1);
    }

    // delegate_cli passes [task, file1, file2, ...]
    // We assume the first argument is the task/message.
    const args = process.argv.slice(2);
    const message = args[0];
    const files = args.slice(1);

    // Construct arguments for aider
    const aiderArgs = [
        'aider',
        '--model', 'deepseek/deepseek-chat',
        '--api-key', `deepseek=${apiKey}`,
    ];

    if (message) {
        aiderArgs.push('--message', message);
    }

    // Append files (aider accepts them as positional args)
    if (files.length > 0) {
        aiderArgs.push(...files);
    }

    console.log(`[DeepSeek+Aider] Starting aider with model deepseek/deepseek-chat...`);
    console.log(`[DeepSeek+Aider] Message: ${message}`);
    console.log(`[DeepSeek+Aider] Files: ${files.join(', ')}`);

    // Use shell: true to resolve npx correctly
    const child = spawn('npx', aiderArgs, {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            DEEPSEEK_API_KEY: apiKey
        }
    });

    child.on('exit', (code) => {
        process.exit(code ?? 0);
    });

    child.on('error', (err) => {
        console.error(`[DeepSeek+Aider] Failed to start aider: ${err.message}`);
        process.exit(1);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
