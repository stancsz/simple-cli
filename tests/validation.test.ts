import { describe, it, expect } from 'vitest';
import { validateToolExecution } from '../src/security/validation.js';
import { ContextManager } from '../src/context.js';
import { resolve } from 'path';

describe('validateToolExecution', () => {
  const mockCwd = resolve('/tmp/mock-workspace');

  // Mock ContextManager
  const mockCtx = {
    getCwd: () => mockCwd
  } as unknown as ContextManager;

  it('should allow valid run_command', () => {
    const result = validateToolExecution('run_command', { command: 'ls -la' }, mockCtx);
    expect(result.valid).toBe(true);
  });

  it('should block rm -rf /', () => {
    const result = validateToolExecution('run_command', { command: 'rm -rf /' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Destructive command detected');
  });

  it('should block rm -rf / variant', () => {
    const result = validateToolExecution('run_command', { command: 'rm -r -f /' }, mockCtx);
    expect(result.valid).toBe(false);
  });

  it('should block mkfs', () => {
    const result = validateToolExecution('run_command', { command: 'mkfs.ext4 /dev/sda1' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Filesystem creation detected');
  });

  it('should block fork bomb', () => {
    const result = validateToolExecution('run_command', { command: ':(){ :|:& };:' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Fork bomb');
  });

  it('should allow writing to file within workspace', () => {
    const result = validateToolExecution('write_to_file', { path: 'src/test.ts' }, mockCtx);
    expect(result.valid).toBe(true);
  });

  it('should block path traversal', () => {
    const result = validateToolExecution('write_to_file', { path: '../outside.ts' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('outside the workspace');
  });

  it('should block absolute path outside workspace', () => {
     // This depends on how resolve works with absolute paths.
     // resolve('/tmp/mock-workspace', '/etc/passwd') -> '/etc/passwd'
     // relative('/tmp/mock-workspace', '/etc/passwd') -> '../../etc/passwd'
     const result = validateToolExecution('write_to_file', { path: '/etc/passwd' }, mockCtx);
     expect(result.valid).toBe(false);
     expect(result.message).toContain('outside the workspace');
  });

  it('should block .env modification', () => {
    const result = validateToolExecution('write_to_file', { path: '.env' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('.env files is restricted');
  });

  it('should block .git modification', () => {
    const result = validateToolExecution('delete_file', { path: '.git/config' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('.git directory is restricted');
  });

  it('should validate write_files with multiple files', () => {
      const result = validateToolExecution('write_files', {
          files: [
              { path: 'valid.ts' },
              { path: '../invalid.ts' }
          ]
      }, mockCtx);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('outside the workspace');
  });

  it('should block sibling directory traversal via prefix matching', () => {
    const siblingPath = '../mock-workspace-secrets/file.txt';
    const result = validateToolExecution('write_to_file', { path: siblingPath }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('outside the workspace');
 });
});
