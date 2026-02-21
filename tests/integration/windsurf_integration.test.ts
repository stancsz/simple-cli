import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

// Hoist mocks
const mocks = vi.hoisted(() => {
    const execute = vi.fn();
    return {
        init: vi.fn().mockResolvedValue(undefined),
        getTools: vi.fn().mockResolvedValue([
            {
                name: 'log_experience',
                execute: execute
            }
        ]),
        execute: execute
    };
});

// Mock MCP client
vi.mock('../../src/mcp.js', () => {
    return {
        MCP: vi.fn().mockImplementation(() => {
            return {
                init: mocks.init,
                getTools: mocks.getTools,
            };
        })
    };
});

// Mock child_process
vi.mock('child_process', () => {
    return {
        spawn: vi.fn(),
    };
});

// Import WindsurfServer AFTER mocking
import { WindsurfServer } from '../../src/mcp_servers/windsurf/index.js';


describe('Windsurf MCP Server Integration', () => {
  let server: WindsurfServer;
  let mockSpawn: any;
  let registeredTools: Record<string, Function> = {};

  beforeEach(() => {
    // Reset mocks
    mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    mockSpawn.mockReset();
    mocks.execute.mockReset();
    mocks.init.mockClear();
    mocks.getTools.mockClear();

    // Default mock spawn implementation (success)
    mockSpawn.mockImplementation(() => {
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      setTimeout(() => {
          child.stdout.emit('data', 'Mock Windsurf Output');
          child.emit('close', 0);
      }, 10);
      return child;
    });

    // Capture tool registrations
    registeredTools = {};
    // We spy on McpServer.prototype.tool to capture handlers
    // Note: We must spy BEFORE instantiating the server
    vi.spyOn(McpServer.prototype, 'tool').mockImplementation((name, description, schema, handler) => {
        registeredTools[name] = handler;
        return {} as any;
    });

    if (existsSync('.windsurf')) {
      rmSync('.windsurf', { recursive: true, force: true });
    }

    server = new WindsurfServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (existsSync('.windsurf')) {
      rmSync('.windsurf', { recursive: true, force: true });
    }
  });

  it('should register expected tools', () => {
    expect(registeredTools).toHaveProperty('windsurf_create_session');
    expect(registeredTools).toHaveProperty('windsurf_join_session');
    expect(registeredTools).toHaveProperty('windsurf_edit_code');
    expect(registeredTools).toHaveProperty('windsurf_get_feedback');
  });

  it('windsurf_create_session should call CLI and log to Brain', async () => {
    const result = await registeredTools['windsurf_create_session']({
        projectPath: '/path/to/project',
        collaborators: ['user@example.com']
    });

    // Verify CLI call
    expect(mockSpawn).toHaveBeenCalledWith('windsurf', ['--new-session', '/path/to/project', '--invite', 'user@example.com'], expect.anything());

    // Verify Result
    expect(result.content[0].text).toContain('Successfully created Windsurf session');

    // Verify Brain Logging
    expect(mocks.init).toHaveBeenCalled();
    expect(mocks.getTools).toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
        task_type: 'windsurf_collaboration',
        outcome: 'success',
        summary: 'Session created successfully.'
    }));
  });

  it('windsurf_join_session should call CLI', async () => {
    const result = await registeredTools['windsurf_join_session']({
        sessionId: 'session-123'
    });

    expect(mockSpawn).toHaveBeenCalledWith('windsurf', ['--join-session', 'session-123'], expect.anything());
    expect(result.content[0].text).toContain('Successfully joined session');
  });

  it('windsurf_edit_code should create task file, call CLI, and log to Brain', async () => {
    const result = await registeredTools['windsurf_edit_code']({
        filePath: 'src/main.ts',
        instruction: 'Refactor code',
        context: 'Use async/await'
    });

    // Verify Task File Creation
    const callArgs = mockSpawn.mock.calls[0][1];
    // Expected args: [taskFilePath, filePath]
    expect(callArgs[0]).toMatch(/[\\/]\.windsurf[\\/]tasks[\\/].*_edit_src_main\.ts\.md$/);
    expect(callArgs[1]).toBe('src/main.ts');

    // Verify Brain Logging
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
        task_type: 'windsurf_collaboration',
        outcome: 'success',
        summary: 'Edit task opened in Windsurf.',
        artifacts: JSON.stringify(['src/main.ts'])
    }));
  });

  it('windsurf_get_feedback should call CLI and return output', async () => {
     // Mock specific output for feedback
     mockSpawn.mockImplementationOnce(() => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { write: vi.fn(), end: vi.fn() };
        setTimeout(() => {
            child.stdout.emit('data', 'Code looks good, but add comments.');
            child.emit('close', 0);
        }, 10);
        return child;
      });

    const result = await registeredTools['windsurf_get_feedback']({ filePath: 'src/main.ts' });

    expect(mockSpawn).toHaveBeenCalledWith('windsurf', ['--get-feedback', 'src/main.ts'], expect.anything());
    expect(result.content[0].text).toBe('Code looks good, but add comments.');

    // Verify Brain Logging
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'success',
        summary: 'Code looks good, but add comments.'
    }));
  });

  it('should handle CLI errors and log failure to Brain', async () => {
    mockSpawn.mockImplementation(() => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { write: vi.fn(), end: vi.fn() };
        setTimeout(() => {
            child.stderr.emit('data', 'Connection failed');
            child.emit('close', 1);
        }, 10);
        return child;
    });

    const result = await registeredTools['windsurf_create_session']({ projectPath: '.' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to create session');

    // Verify Brain Logging Failure
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'failure',
        summary: expect.stringContaining('Connection failed')
    }));
  });
});
