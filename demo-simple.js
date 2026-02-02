#!/usr/bin/env node
/**
 * Simple File Move Demo - Direct test without JIT complexity
 */

import { execSync, spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEMO_DIR = join(__dirname, 'simple_demo');

async function runCli(userMessage) {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 Running: "${userMessage}"\n`);
        const cliProcess = spawn('node', [
            join(__dirname, 'dist', 'cli.js'),
            DEMO_DIR,
            '--yolo', // YOLO mode - auto-approve
            userMessage
        ], {
            cwd: __dirname,
            stdio: 'inherit'
        });

        const timeout = setTimeout(() => {
            console.log('\n⏱️  Timeout, stopping...');
            cliProcess.kill('SIGINT');
        }, 30000);

        cliProcess.on('close', (code) => {
            clearTimeout(timeout);
            resolve(code);
        });

        cliProcess.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function main() {
    console.log('📁 Simple File Move Demo\n');
    console.log('='.repeat(60));

    // Clean up
    if (existsSync(DEMO_DIR)) {
        console.log('🧹 Cleaning up...');
        rmSync(DEMO_DIR, { recursive: true, force: true });
    }

    // Create demo structure
    console.log('📁 Creating test directory...');
    mkdirSync(DEMO_DIR);
    mkdirSync(join(DEMO_DIR, 'dest'));

    writeFileSync(join(DEMO_DIR, 'test.txt'), 'Hello World');
    console.log('📄 Created test.txt');

    // Test 1: Move file
    await runCli(`Move the file test.txt to dest/moved.txt`);

    console.log('\n📦 Results:');
    const destFiles = existsSync(join(DEMO_DIR, 'dest')) ? readdirSync(join(DEMO_DIR, 'dest')) : [];
    const rootFiles = readdirSync(DEMO_DIR).filter(f => f !== 'dest' && f !== '.simple');

    console.log(`  Root files: [${rootFiles.join(', ')}]`);
    console.log(`  Dest files: [${destFiles.join(', ')}]`);

    if (destFiles.includes('moved.txt') && !rootFiles.includes('test.txt')) {
        console.log('\n✅ SUCCESS: File moved correctly!');
    } else {
        console.log('\n❌ FAIL: File not moved as expected');
    }

    console.log('\n📂 Demo folder:', DEMO_DIR);
    console.log('='.repeat(60));
}

main().catch(err => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
