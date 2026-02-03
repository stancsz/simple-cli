
import { describe, it, expect } from 'vitest';
import { TypeLLM } from '../../TypeLLM/src/index';
import { parseResponse } from '../src/lib/agent';
import { routeTask } from '../src/router';
import { jsonrepair } from 'jsonrepair';

describe('System Limitation Stress Test', () => {

    describe('TypeLLM Parser Stress (The Hallucination Bridge)', () => {
        const llm = new TypeLLM({ model: 'test', provider: 'openai', apiKey: 'test' });
        const parse = (llm as any).parseAndRepair.bind(llm);

        it('should handle "Flat Root" hallucination where tools/args are mixed at root', () => {
            const evil = `{
                "thought": "I need to add",
                "command": "addition",
                "a": 10,
                "b": 20
            }`;
            const res = parse(evil);
            expect(res.tool).toBe('addition');
            expect(res.args).toMatchObject({ a: 10, b: 20 });
        });

        it('should recover from massive conversational prefix and code blocks', () => {
            const evil = `Certainly! I'll help you with that. 
            Here is the JSON you need:
            \`\`\`json
            {
                "thought": "Thinking...",
                "action": "list_dir",
                "parameters": { "path": "." }
            }
            \`\`\`
            I hope this helps!`;
            const res = parse(evil);
            expect(res.tool).toBe('list_dir');
            expect(res.args).toMatchObject({ path: '.' });
        });

        it('should handle "Nested Key Hallucination"', () => {
            const evil = `{
                "step": "write_to_file",
                "properties": { "file": "test.txt", "content": "hello" }
            }`;
            const res = parse(evil);
            expect(res.tool).toBe('write_to_file');
            expect(res.args).toMatchObject({ file: 'test.txt' });
        });

        it('should fall back gracefully to "none" on absolute garbage', () => {
            const evil = `This is just a sentence with no JSON.`;
            const res = parse(evil);
            expect(res.tool).toBe('none');
        });
    });

    describe('MoE Router Stress', () => {
        it('should handle "Broken JSON" in routing response via jsonrepair', async () => {
            const brokenJson = `{"complexity": 8, "recommendedTier": 1, "reasoning": "Missing quote}`;
            const call = async () => brokenJson;
            const res = await routeTask("Test task", call);
            expect(res.tier).toBe(1); // Should repair and work
        });

        it('should use default routing when JSON is completely invalid', async () => {
            const garbage = `No JSON here!`;
            const call = async () => garbage;
            const res = await routeTask("Test task", call);
            expect(res.tier).toBe(3); // Default fallback
        });
    });

    describe('Agent Action Parsing Boundary (Aider vs JSON)', () => {
        it('should prioritize structured JSON over Aider blocks when both exist (Ambiguity Stress)', () => {
            const mixed = "file.txt\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n{ \"tool\": \"run_command\", \"args\": { \"command\": \"ls\" } }";
            const res = parseResponse(mixed);
            expect(res.action.tool).toBe('run_command');
            expect(res.editBlocks?.length).toBe(1);
        });
    });
});
