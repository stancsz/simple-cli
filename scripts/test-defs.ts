import { loadAllTools, getToolDefinitions } from '../src/registry.js';

async function testDefs() {
    process.argv.push('--claw');
    const tools = await loadAllTools();
    const defs = getToolDefinitions(tools);
    console.log('Is scheduler in defs?', defs.includes('### scheduler'));
}

testDefs();
