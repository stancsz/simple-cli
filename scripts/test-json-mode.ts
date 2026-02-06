import 'dotenv/config';
import fetch from 'node-fetch';
import pc from 'picocolors';

async function testJsonMode() {
    console.log(pc.cyan('🧪 Testing JSON Mode...'));

    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "You must respond with valid JSON containing: tool, thought, and args fields." },
                    { role: "user", content: "List the files in the current directory" }
                ],
                response_format: { type: "json_object" }
            })
        });

        const data = await res.json() as any;
        const response = data.choices?.[0]?.message?.content || '';

        console.log(pc.green('✅ Raw Response:'));
        console.log(response);

        const parsed = JSON.parse(response);
        console.log(pc.green('\n✅ Parsed JSON:'));
        console.log(JSON.stringify(parsed, null, 2));

    } catch (error) {
        console.error(pc.red('❌ Failed:'), error);
        process.exit(1);
    }
}

testJsonMode();
