import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorServer } from '../../src/mcp_servers/cursor/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Cursor MCP Server', () => {
  let server: CursorServer;
  let mockSpawn: any;
  let tools: Record<string, Function> = {};

  beforeEach(() => {
    mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    mockSpawn.mockReset();

    mockSpawn.mockImplementation(() => {
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      setTimeout(() => child.emit('close', 0), 10);
      return child;
    });

    // Capture tool registrations
    tools = {};
    vi.spyOn(McpServer.prototype, 'tool').mockImplementation((name, description, schema, handler) => {
        tools[name] = handler;
        return {} as any; // Return dummy
    });

    if (existsSync('.cursor')) {
      rmSync('.cursor', { recursive: true, force: true });
    }

    server = new CursorServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
     if (existsSync('.cursor')) {
      rmSync('.cursor', { recursive: true, force: true });
    }
  });

  it('should register expected tools', () => {
    expect(tools).toHaveProperty('cursor_open');
    expect(tools).toHaveProperty('cursor_execute_task');
    expect(tools).toHaveProperty('cursor_edit_file');
    expect(tools).toHaveProperty('cursor_generate_code');
  });

  it('cursor_open should call cursor cli', async () => {
    const result = await tools['cursor_open']({ paths: ['src/test.ts'], newWindow: true });
    expect(mockSpawn).toHaveBeenCalledWith('cursor', ['src/test.ts', '-n'], expect.anything());
    expect(result.content[0].text).toContain('Successfully opened');
  });

  it('cursor_execute_task should create file and open it', async () => {
    const result = await tools['cursor_execute_task']({
        title: 'Test Task',
        description: 'Do something',
        files: ['file1.ts']
    });

    const callArgs = mockSpawn.mock.calls[0][1];
    expect(callArgs[0]).toMatch(/\.cursor\/tasks\/.*_Test_Task\.md$/);
    expect(callArgs[1]).toBe('file1.ts');
    expect(result.content[0].text).toContain('Task created');
  });

   it('cursor_edit_file should create edit task file', async () => {
    const result = await tools['cursor_edit_file']({
        file: 'src/main.ts',
        instructions: 'Add logging'
    });

    const callArgs = mockSpawn.mock.calls[0][1];
    expect(callArgs[0]).toMatch(/\.cursor\/tasks\/.*_edit_src_main\.ts\.md$/);
    expect(callArgs[1]).toBe('src/main.ts');
  });

  it('cursor_generate_code should create generation task file', async () => {
    const result = await tools['cursor_generate_code']({
        description: 'Generate a server',
        outputFile: 'server.ts'
    });

    const callArgs = mockSpawn.mock.calls[0][1];
    expect(callArgs[0]).toMatch(/\.cursor\/tasks\/.*_generate\.md$/);
    expect(callArgs[1]).toBe('server.ts');
  });

  it('should handle cursor cli errors', async () => {
    mockSpawn.mockImplementation(() => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { write: vi.fn(), end: vi.fn() };
        setTimeout(() => {
            child.stderr.emit('data', 'Command not found');
            child.emit('close', 127);
        }, 10);
        return child;
    });

    const result = await tools['cursor_open']({ paths: ['src/test.ts'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to open in Cursor');
    expect(result.content[0].text).toContain('Command not found');
  });
});
