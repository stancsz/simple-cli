#!/usr/bin/env npx tsx
/**
 * Test Jules detection and task creation logic
 */
import { execSync } from 'child_process';

function run(cmd: string) {
    return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
}

async function testJulesDetection() {
    console.log("Testing Jules detection...\n");

    // Get PR data
    const prJson = run('gh pr view 171 --json number,author,headRefName');
    const pr = JSON.parse(prJson);

    console.log("PR #:", pr.number);
    console.log("Author login:", pr.author.login);
    console.log("Branch:", pr.headRefName);

    // Test detection logic
    const isJules = pr.author.login.toLowerCase().includes('jules') ||
        pr.author.login.toLowerCase().includes('google-labs-jules');

    console.log("\nDetection result:", isJules ? "✓ Jules detected" : "✗ Not Jules");

    if (isJules) {
        console.log("\n✓ Would trigger Jules API task creation");
        console.log("Task would be created for branch:", pr.headRefName);
    } else {
        console.log("\n✗ Would use regular agent comment");
    }
}

testJulesDetection();
