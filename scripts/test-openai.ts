import 'dotenv/config';
import { createProviderForModel } from '../src/providers/index.js';

async function testOpenAI() {
    const model = 'openai:gpt-5-mini';
    const provider = createProviderForModel(model);
    console.log(`Testing OpenAI with model: ${model}`);

    try {
        const response = await provider.generateResponse('You are a helpful assistant.', [
            { role: 'user', content: 'What is the capital of Japan? Reply in one word.' }
        ]);
        console.log('OpenAI Response:', response);
    } catch (error) {
        console.error('OpenAI Error:', error);
    }
}

testOpenAI();
