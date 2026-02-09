
import { jsonrepair } from 'jsonrepair';

function parse(raw) {
    try {
        const jsonPart = raw.trim().match(/\{[\s\S]*\}/)?.[0] || raw;
        console.log('JSON Part:', jsonPart);
        const repaired = jsonrepair(jsonPart);
        console.log('Repaired:', repaired);
        const p = JSON.parse(repaired);
        return {
            thought: p.thought || '',
            tool: (p.tool || p.command || 'none').toLowerCase(),
            args: p.args || p.parameters || {},
            message: p.message || '',
            raw
        };
    } catch (e) {
        console.error('Parse error:', e.message);
        return { thought: '', tool: 'none', args: {}, message: raw, raw };
    }
}

const input = `{"thought":"Call ping_tool to return the success message.","tool":"ping_tool","args":{}}`;
const result = parse(input);
console.log('Result:', result);
