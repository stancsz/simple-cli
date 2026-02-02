
import 'dotenv/config';
import { createProvider } from '../src/providers/index.js';
import pc from 'picocolors';

async function testConnection() {
    console.log(pc.cyan('🔌 Testing LLM Connectivity...'));

    const model = process.env.OPENAI_MODEL || 'unknown';
    console.log(pc.dim(`   Model: ${model}`));
    console.log(pc.dim(`   Key Present: ${!!process.env.OPENAI_API_KEY}`));

    try {
        const provider = createProvider();
        const start = Date.now();

        console.log(pc.yellow('⏳ Sending ping to LLM...'));
        const response = await provider.generateResponse(
            'You are a ping bot. Reply with "PONG" and nothing else.',
            [{ role: 'user', content: 'PING' }]
        );

        const duration = Date.now() - start;

        if (response && (response.raw?.includes('PONG') || response.message?.includes('PONG'))) {
            console.log(pc.green(`✅ Success! Received response in ${duration}ms`));
            console.log(pc.dim(`   Output: "${response.message || response.thought || response.raw}"`));
            process.exit(0);
        } else {
            console.log(pc.red('❌ Received unexpected response:'));
            console.log(JSON.stringify(response, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error(pc.red('❌ Connection failed:'));
        console.error(error);
        process.exit(1);
    }
}

testConnection();
