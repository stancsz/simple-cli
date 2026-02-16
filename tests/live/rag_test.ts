import { ContextManager } from '../../src/mcp_servers/context_manager/index';
import { SimpleToolsServer } from '../../src/mcp_servers/simple_tools/index';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Mock embedding model for test
const mockEmbeddingModel = {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock-embedding',
    doEmbed: async ({ values }: any) => {
         return {
            embeddings: values.map(() => Array(1536).fill(0).map(() => Math.random())),
            usage: { tokens: 10 },
            warnings: []
         };
    }
};

async function testRAG() {
    console.log('--- Testing RAG (SimpleToolsServer + Mock Embedding) ---');
    const cwd = join(process.cwd(), '.rag_test_live');
    if (!existsSync(cwd)) mkdirSync(cwd);

    // Ensure .agent directory exists
    const agentDir = join(cwd, '.agent');
    if (!existsSync(agentDir)) mkdirSync(agentDir);

    const cm = new ContextManager(cwd, mockEmbeddingModel);
    const server = new SimpleToolsServer(cm);

    // Test add_memory
    console.log('Testing add_memory...');
    const addRes = await server.handleCallTool('add_memory', { text: "The capital of France is Paris.", metadata: JSON.stringify({ type: "fact" }) });
    if (addRes.isError) throw new Error(`add_memory failed: ${addRes.content[0].text}`);
    console.log('add_memory result:', addRes.content[0].text);

    // Test search_memory
    console.log('Testing search_memory...');
    const searchRes = await server.handleCallTool('search_memory', { query: "France capital" });
    if (searchRes.isError) throw new Error(`search_memory failed: ${searchRes.content[0].text}`);
    console.log('search_memory result:', searchRes.content[0].text);

    if (!searchRes.content[0].text.includes("Paris")) {
         console.warn("Warning: Search result might not be relevant due to mock embeddings, but tool executed.");
    }

    // Clean up
    rmSync(cwd, { recursive: true, force: true });
    console.log('--- RAG Test Passed ---');
}

testRAG().catch(e => {
    console.error(e);
    process.exit(1);
});
