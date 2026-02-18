import { test, mock } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';

// Define mocks
const spawnMock = mock.fn((...args) => {
    const child = new EventEmitter();
    (child as any).stdout = new EventEmitter();
    (child as any).stderr = new EventEmitter();
    (child as any).stdin = { write: () => {}, end: () => {} };
    setTimeout(() => {
        child.emit('exit', 0);
        child.emit('close', 0);
    }, 10);
    return child;
});

const writeFileMock = mock.fn(async () => {});
const mkdirMock = mock.fn(async () => {});
const readFileMock = mock.fn(async () => "soul content");

// Mock modules
mock.module('child_process', {
    namedExports: { spawn: spawnMock }
});

mock.module('fs/promises', {
    namedExports: {
        writeFile: writeFileMock,
        mkdir: mkdirMock,
        readFile: readFileMock
    }
});

// Import class under test
const { CrewAIServer } = await import('../../src/mcp_servers/crewai/index.js');

test('CrewAIServer', async (t) => {
    let server;

    t.beforeEach(() => {
        // Clear mocks manually if needed, or rely on new server instance state
        // spawnMock.mock.calls is read-only array usually? No, it's a getter.
        // We can't clear mock history easily in node:test without creating new mock function
        // But for this simple test suite, it's fine.
        server = new CrewAIServer();
    });

    await t.test('spawnSubagent stores agent', () => {
        const agentId = server.spawnSubagent('Researcher', 'Find info', 'Expert');
        assert.ok(agentId);
        // agents is private, but in JS we can access it
        assert.strictEqual((server as any).agents.length, 1);
        assert.strictEqual((server as any).agents[0].role, 'Researcher');
    });

    await t.test('negotiateTask stores message', () => {
        const result = server.negotiateTask('A', 'B', 'Task', 'Msg');
        assert.match(result, /Message sent/);
        assert.strictEqual((server as any).negotiations.length, 1);
    });

    await t.test('startCrew generates script', async () => {
        // Reset state
        (server as any).agents = [];

        server.spawnSubagent('Researcher', 'Find info', 'Expert');

        // Count calls before
        const initialWriteCalls = writeFileMock.mock.calls.length;

        await server.startCrew('Task 1');

        const finalWriteCalls = writeFileMock.mock.calls.length;
        // Should write config.json AND script.py
        assert.strictEqual(finalWriteCalls, initialWriteCalls + 2);

        // Check config.json content (first call)
        const configContent = writeFileMock.mock.calls[initialWriteCalls].arguments[1];
        assert.match(configContent, /"role": "Researcher"/);

        // Check script.py content (second call)
        const scriptContent = writeFileMock.mock.calls[initialWriteCalls + 1].arguments[1];
        assert.match(scriptContent, /import json/);
        assert.match(scriptContent, /json\.load/);
        assert.match(scriptContent, /config\['role'\]/);
    });
});
