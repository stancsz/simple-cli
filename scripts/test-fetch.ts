
import 'dotenv/config';
import pc from 'picocolors';

async function testFetch() {
    console.log(pc.cyan('🔌 Testing OpenAI API via Fetch...'));

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        console.error('❌ No API Key found');
        process.exit(1);
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: "gpt-5-mini",
                messages: [{ role: "user", content: "Say PONG" }],
                max_completion_tokens: 10
            })
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(pc.red(`❌ API Error: ${response.status} ${response.statusText}`));
            console.error(text);
            process.exit(1);
        }

        const data = await response.json();
        console.log(pc.green('✅ Success!'));
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error(pc.red('❌ Network failed:'));
        console.error(error);
        process.exit(1);
    }
}

testFetch();
