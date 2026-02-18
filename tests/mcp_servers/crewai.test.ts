import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrewAIServer } from '../../src/mcp_servers/crewai/index.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { writeFile } from 'fs/promises';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readFile: vi.fn().mockResolvedValue("soul content"),
    };
});

describe('CrewAIServer', () => {
  let server: CrewAIServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new CrewAIServer();

    // Mock spawn implementation for each test
    (spawn as any).mockImplementation(() => {
        const child = new EventEmitter();
        (child as any).stdout = new EventEmitter();
        (child as any).stderr = new EventEmitter();
        (child as any).stdin = { write: vi.fn(), end: vi.fn() };

        setTimeout(() => {
            child.emit('exit', 0);
            child.emit('close', 0);
        }, 10);

        return child;
    });
  });

  it('spawnSubagent stores agent', async () => {
    const agentId = (server as any).spawnSubagent('Researcher', 'Find info', 'Expert');
    expect(agentId).toBeDefined();
    expect((server as any).agents).toHaveLength(1);
    expect((server as any).agents[0].role).toBe('Researcher');
  });

  it('negotiateTask stores message', async () => {
    const result = (server as any).negotiateTask('A', 'B', 'Task', 'Msg');
    expect(result).toContain('Message sent');
    expect((server as any).negotiations).toHaveLength(1);
  });

  it('startCrew generates script', async () => {
    // Reset state
    (server as any).agents = [];
    (server as any).spawnSubagent('Researcher', 'Find info', 'Expert');

    // Count calls before (should be 0 since clearAllMocks)
    expect(writeFile).not.toHaveBeenCalled();

    await (server as any).startCrew('Task 1');

    // Should write config.json AND script.py
    expect(writeFile).toHaveBeenCalledTimes(2);

    // Check config.json content (first call)
    const configContent = (writeFile as any).mock.calls[0][1];
    expect(configContent).toContain('"role": "Researcher"');

    // Check script.py content (second call)
    const scriptContent = (writeFile as any).mock.calls[1][1];
    expect(scriptContent).toContain('import json');
    expect(scriptContent).toContain('json.load');
    expect(scriptContent).toContain("config['role']");
  });
});
