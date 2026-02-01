#!/usr/bin/env node
/**
 * Claw Mode Demo Runner
 * 
 * This script demonstrates the --claw functionality by:
 * 1. Creating a demo Downloads folder with sample files
 * 2. Running simple-cli with claw intent to organize files
 * 3. Adding more files and running again
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { execSync, spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEMO_DIR = join(__dirname, 'demo_downloads');

async function runCli(intent, model = null) {
    return new Promise((resolve, reject) => {
        const modelToUse = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        console.log(`\n🚀 Starting Simple-CLI with model: ${modelToUse} and intent: "${intent}"...\n`);
        const cliProcess = spawn('node', [
            join(__dirname, 'dist', 'cli.js'),
            DEMO_DIR,
            '-claw',
            intent
        ], {
            cwd: __dirname,
            stdio: 'inherit',
            env: { ...process.env, OPENAI_MODEL: modelToUse }
        });

        const timeout = setTimeout(() => {
            console.log('\n⏱️  Timeout reached, stopping process...');
            cliProcess.kill('SIGINT');
        }, 90000);

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
    console.log('🧬 Claw Mode Demo - File Organization Assistant\n');
    console.log('='.repeat(60));

    // Clean up
    if (existsSync(DEMO_DIR)) {
        console.log('🧹 Cleaning up existing demo directory...');
        rmSync(DEMO_DIR, { recursive: true, force: true });
    }

    // Create demo structure
    console.log('📁 Creating demo Downloads folder...');
    mkdirSync(DEMO_DIR);
    mkdirSync(join(DEMO_DIR, 'Photos'));
    mkdirSync(join(DEMO_DIR, 'Documents'));
    mkdirSync(join(DEMO_DIR, 'Trash'));

    // Batch 1
    console.log('📄 Creating initial sample files...');
    writeFileSync(join(DEMO_DIR, 'vacation.jpg'), 'fake image data');
    writeFileSync(join(DEMO_DIR, 'invoice.pdf'), 'fake document data');
    writeFileSync(join(DEMO_DIR, 'setup.msi'), 'fake installer data');
    writeFileSync(join(DEMO_DIR, 'receipt_starbucks.txt'), 'Receipt\nTotal: $12.50\nDate: 2026-01-31');
    writeFileSync(join(DEMO_DIR, 'Expenses.csv'), 'Date,Amount,Description\n');

    const intent = "Scan my current directory. Sort images (jpg, png) into /Photos, docs (pdf, docx) into /Documents, and installers (exe, msi) into /Trash. If you find a receipt, extract the total and log it to Expenses.csv before moving the file. DO NOT write a script. Use your tools (list_dir, move_file, write_to_file) to do it yourself right now.";

    const openAiModel = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

    // Run 1: OpenAI
    console.log(`\n🔵 Phase 1: Organizing with OpenAI (${openAiModel})`);
    await runCli(intent, openAiModel);

    console.log('\n📦 Phase 1 Results:');
    showResults();

    // Add more files (Batch 2)
    console.log('\n➕ Adding more files for the second scan...');
    writeFileSync(join(DEMO_DIR, 'family.png'), 'more image data');
    writeFileSync(join(DEMO_DIR, 'report_v2.docx'), 'more document data');
    writeFileSync(join(DEMO_DIR, 'receipt_dinner.txt'), 'Dinner Receipt\nTotal: $45.00\nDate: 2026-01-31');

    // Run 2: Gemini
    console.log(`\n🟢 Phase 2: Organizing with Gemini (${geminiModel})`);
    await runCli(intent, geminiModel);

    console.log('\n📦 Phase 2 Results:');
    showResults();

    console.log('\n📂 Demo folder preserved at:', DEMO_DIR);
    console.log('='.repeat(60));
}

function showResults() {
    const photosFiles = existsSync(join(DEMO_DIR, 'Photos')) ? readdirSync(join(DEMO_DIR, 'Photos')) : [];
    const docsFiles = existsSync(join(DEMO_DIR, 'Documents')) ? readdirSync(join(DEMO_DIR, 'Documents')) : [];
    const trashFiles = existsSync(join(DEMO_DIR, 'Trash')) ? readdirSync(join(DEMO_DIR, 'Trash')) : [];

    console.log(`  Photos: [${photosFiles.join(', ')}]`);
    console.log(`  Documents: [${docsFiles.join(', ')}]`);
    console.log(`  Trash: [${trashFiles.join(', ')}]`);

    const expensesPath = join(DEMO_DIR, 'Expenses.csv');
    if (existsSync(expensesPath)) {
        console.log('  Expenses Log:');
        console.log(readFileSync(expensesPath, 'utf-8').trim().split('\n').map(l => `    ${l}`).join('\n'));
    }
}

main().catch(err => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
});
