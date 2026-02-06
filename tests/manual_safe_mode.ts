/**
 * Manual test for Safe Mode
 * Run with: node --loader ts-node/esm tests/manual_safe_mode.ts
 */

import { getContextManager } from '../src/context.js';
import { execute as writeToFile } from '../src/tools/write_to_file.js';
import { execute as writeFiles } from '../src/tools/write_files.js';
import { execute as verifyStaged } from '../src/tools/verify_staged.js';
import { execute as commitStaged } from '../src/tools/commit_staged.js';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

async function runTest() {
  const testDir = resolve('test_safe_mode_workspace');
  // Clean up previous run
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });

  const ctx = getContextManager(testDir);

  console.log('Setting up test workspace:', testDir);

  // Create a dummy package.json so verify_staged doesn't complain (it copies excluded files but needs structure)
  await writeFile(join(testDir, 'package.json'), '{}');
  await writeFile(join(testDir, 'original.txt'), 'original content');

  // Initialize context and enable safe mode
  await ctx.initialize();
  ctx.setStagingMode(true);

  console.log('Safe Mode Enabled:', ctx.isStagingMode());

  // Test 1: write_to_file
  console.log('\n--- Test 1: write_to_file ---');
  await writeToFile({
    path: join(testDir, 'new_file.txt'),
    content: 'new content'
  });

  // Verify it's NOT in real dir
  if (existsSync(join(testDir, 'new_file.txt'))) {
    console.error('FAIL: File written to real directory in safe mode!');
    process.exit(1);
  } else {
    console.log('PASS: File not in real directory.');
  }

  // Verify it IS in staging
  const stagedFile = ctx.getStagedPath(join(testDir, 'new_file.txt'));
  if (existsSync(stagedFile)) {
    console.log('PASS: File found in staging:', stagedFile);
  } else {
    console.error('FAIL: File not found in staging!');
    process.exit(1);
  }

  // Test 2: write_files (edit)
  console.log('\n--- Test 2: write_files (search/replace) ---');
  await writeFiles({
    files: [{
      path: join(testDir, 'original.txt'),
      searchReplace: [{ search: 'original', replace: 'modified' }]
    }]
  });

  // Verify original is untouched
  const originalContent = await readFile(join(testDir, 'original.txt'), 'utf-8');
  if (originalContent !== 'original content') {
    console.error('FAIL: Original file modified!');
    process.exit(1);
  } else {
    console.log('PASS: Original file untouched.');
  }

  // Verify staged has modification
  const stagedOriginalPath = ctx.getStagedPath(join(testDir, 'original.txt'));
  if (existsSync(stagedOriginalPath)) {
    const stagedContent = await readFile(stagedOriginalPath, 'utf-8');
    if (stagedContent === 'modified content') {
      console.log('PASS: Staged file has modifications.');
    } else {
      console.error('FAIL: Staged file content incorrect:', stagedContent);
      process.exit(1);
    }
  } else {
    console.error('FAIL: Staged file not found for edit!');
    process.exit(1);
  }

  // Test 3: verify_staged
  console.log('\n--- Test 3: verify_staged ---');
  // We'll run a command that checks for the existence of new_file.txt
  // Since verify_staged runs in a sandbox where staged files are applied, new_file.txt should exist there.
  const verifyResult = await verifyStaged({
    command: process.platform === 'win32' ? 'type new_file.txt' : 'cat new_file.txt'
  });

  if (verifyResult.includes('new content')) {
     console.log('PASS: Verification command saw the staged file content.');
  } else {
     console.error('FAIL: Verification command did not see staged content. Output:', verifyResult);
     process.exit(1);
  }

  // Test 4: commit_staged
  console.log('\n--- Test 4: commit_staged ---');
  await commitStaged({});

  // Verify files are now in real dir
  if (existsSync(join(testDir, 'new_file.txt'))) {
    console.log('PASS: new_file.txt promoted to real directory.');
  } else {
    console.error('FAIL: new_file.txt missing from real directory after commit.');
    process.exit(1);
  }

  const committedOriginal = await readFile(join(testDir, 'original.txt'), 'utf-8');
  if (committedOriginal === 'modified content') {
    console.log('PASS: original.txt updated in real directory.');
  } else {
    console.error('FAIL: original.txt content incorrect after commit:', committedOriginal);
    process.exit(1);
  }

  // Verify staging is empty/gone
  if (!existsSync(ctx.getStagingDir())) {
     console.log('PASS: Staging directory removed.');
  } else {
     console.log('WARN: Staging directory still exists (might be empty).');
  }

  console.log('\nALL TESTS PASSED');

  // Cleanup
  await rm(testDir, { recursive: true, force: true });
}

runTest().catch((err) => {
    console.error(err);
    process.exit(1);
});
