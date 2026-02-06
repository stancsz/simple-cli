import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToolExecution } from '../src/validation/safety.js';
import { ContextManager } from '../src/context.js';
import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';

describe('Safety Validation Layer', () => {
  const mockCtx = {} as ContextManager;

  it('should block dangerous commands', async () => {
    const result = await validateToolExecution('run_command', { command: 'rm -rf /' }, mockCtx);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangerous pattern');
  });

  it('should allow safe commands', async () => {
    const result = await validateToolExecution('run_command', { command: 'ls -la' }, mockCtx);
    expect(result.valid).toBe(true);
  });

  it('should block JS file with syntax errors', async () => {
    const result = await validateToolExecution('write_files', {
      files: [{
        path: 'test.js',
        content: 'const x = ;' // Syntax error
      }]
    }, mockCtx);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Syntax validation failed');
  });

  it('should allow valid JS file', async () => {
    const result = await validateToolExecution('write_files', {
      files: [{
        path: 'test.js',
        content: 'const x = 1;'
      }]
    }, mockCtx);

    expect(result.valid).toBe(true);
  });

  describe('Search/Replace Validation', () => {
     const testDir = join(process.cwd(), 'test_validation_tmp');
     const testFile = join(testDir, 'existing.js');

     beforeEach(async () => {
       await mkdir(testDir, { recursive: true });
       await writeFile(testFile, 'const a = 1;', 'utf-8');
     });

     afterEach(async () => {
       await rm(testDir, { recursive: true, force: true });
     });

     it('should validate search/replace resulting in invalid code', async () => {
       // We need to pass the full path so the validator can find the original file
       const result = await validateToolExecution('write_files', {
         files: [{
           path: testFile,
           searchReplace: [{
             search: 'const a = 1;',
             replace: 'const a = ;' // Invalid
           }]
         }]
       }, mockCtx);

       expect(result.valid).toBe(false);
       expect(result.error).toContain('Syntax validation failed');
     });

     it('should validate search/replace resulting in valid code', async () => {
       const result = await validateToolExecution('write_files', {
         files: [{
           path: testFile,
           searchReplace: [{
             search: 'const a = 1;',
             replace: 'const a = 2;'
           }]
         }]
       }, mockCtx);

       expect(result.valid).toBe(true);
     });
  });
});
