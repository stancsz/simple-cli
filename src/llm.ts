import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jsonrepair } from 'jsonrepair';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface LLMResponse {
    thought: string;
    tool: string;
    args: any;
    message?: string;
    raw: string;
}

export class LLM {
    constructor(private config: { provider: string; model: string; apiKey?: string }) { }

    async generate(system: string, history: any[]): Promise<LLMResponse> {
        const payload = {
            ...this.config,
            messages: [{ role: 'system', content: system }, ...history],
            api_key: this.config.apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY
        };

        return new Promise((resolve, reject) => {
            // Find python bridge
            let py = join(__dirname, 'anyllm.py');
            if (!fs.existsSync(py)) py = join(process.cwd(), 'src/lib/anyllm.py'); // Fallback

            const child = spawn('python3', [py]);
            let out = '';
            let err = '';

            child.stdout.on('data', d => out += d);
            child.stderr.on('data', d => err += d);
            child.on('close', code => {
                if (code !== 0) return reject(new Error(err));
                try {
                    const res = JSON.parse(out);
                    if (res.error) return reject(new Error(res.error));
                    resolve(this.parse(res.content));
                } catch (e) { reject(e); }
            });

            child.stdin.write(JSON.stringify(payload));
            child.stdin.end();
        });
    }

    private parse(raw: string): LLMResponse {
        try {
            const repaired = jsonrepair(raw.trim().match(/\{[\s\S]*\}/)?.[0] || raw);
            const p = JSON.parse(repaired);
            return {
                thought: p.thought || '',
                tool: (p.tool || p.command || 'none').toLowerCase(),
                args: p.args || p.parameters || {},
                message: p.message || '',
                raw
            };
        } catch {
            return { thought: '', tool: 'none', args: {}, message: raw, raw };
        }
    }
}

export const createLLM = (model?: string) => {
    const m = model || process.env.MODEL || 'openai:gpt-4o';
    const [p, n] = m.includes(':') ? m.split(':') : ['openai', m];
    return new LLM({ provider: p, model: n });
};
