import 'dotenv/config';
import { createProviderForModel } from '../src/providers/index.js';

async function testGemini() {
    const model = 'google:gemini-3-flash-preview';
    const provider = createProviderForModel(model);
    console.log(`Testing Gemini with model: ${model}`);

    try {
        const response = await provider.generateResponse('You are a helpful assistant.', [
            { role: 'user', content: 'What is the capital of France? Reply in one word.' }
        ]);
        console.log('Gemini Response:', response);
    } catch (error) {
        console.error('Gemini Error:', error);
    }
}

testGemini();
