import 'dotenv/config';
import { createProvider } from './dist/providers/index.js';

async function test() {
    console.log('Testing provider...');
    try {
        const provider = createProvider();
        console.log('Provider created. Model:', provider.model);
        console.log('Sending request...');
        const response = await provider.generateResponse('You are a helpful assistant.', [
            { role: 'user', content: 'Say hello' }
        ]);
        console.log('Response:', response);
    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
