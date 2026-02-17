#!/usr/bin/env npx tsx
/**
 * Simple Code Review
 * Automated PR review and merge system for Simple CLI
 */
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';

const CWD = process.cwd();

function run(cmd: string, options: any = {}) {
    console.log(`> ${cmd}`);
    try {
        return execSync(cmd, { cwd: CWD, encoding: 'utf-8', shell: true, ...options }).trim();
    } catch (e: any) {
        console.error(`Command failed: ${cmd}`);
        if (options.ignoreErrors) return '';
        throw e;
    }
}

function runSafe(cmd: string, args: string[], options: any = {}) {
    console.log(`> ${cmd} ${args.join(' ')}`);
    const res = spawnSync(cmd, args, { cwd: CWD, stdio: 'inherit', shell: true, ...options });
    return res.status === 0;
}

async function main() {
    console.log("🔍 Simple Code Review (Simplified)");
    console.log("===============================");

    // 0. Configure git user for commits
    try {
        run('git config user.name "Simple-CLI Bot"');
        run('git config user.email "bot@simple-cli.dev"');
    } catch (e) {
        console.warn("Failed to configure git user/email.");
    }

    // 1. Check prerequisites
    try {
        run('gh --version');
    } catch (e) {
        console.error("❌ Error: GitHub CLI (gh) is not installed.");
        process.exit(1);
    }

    // 2. List Open PRs
    console.log("Fetching open PRs...");
    let prsJson;
    try {
        prsJson = run('gh pr list --json number,title,mergeable,headRefName,author --state open --limit 10');
    } catch (e) {
        console.error("Failed to fetch PRs.");
        return;
    }

    if (!prsJson) {
        console.log("No open PRs found.");
        return;
    }

    const prs = JSON.parse(prsJson);
    if (prs.length === 0) {
        console.log("✅ No open PRs found.");
        return;
    }

    console.log(`Found ${prs.length} open PRs.`);

    for (const pr of prs) {
        console.log(`\n---------------------------------------------------`);
        console.log(`PR #${pr.number}: ${pr.title}`);
        console.log(`Mergeable Status: ${pr.mergeable}`);

        if (pr.mergeable === 'CONFLICTING') {
            console.log(`❌ PR #${pr.number} is conflicting. Closing...`);
            run(`gh pr close ${pr.number} --comment "Closing PR because it has merge conflicts."`);
            continue;
        }

        console.log(`Checking out PR #${pr.number}...`);
        try {
            run(`gh pr checkout ${pr.number}`);
        } catch (e) {
            console.error(`Failed to checkout PR #${pr.number}. skipping.`);
            continue;
        }

        // Try local merge of main to be absolutely sure
        let isMergeable = true;
        try {
            console.log("Verifying mergeability with origin/main...");
            run('git fetch origin main');
            execSync('git merge origin/main', { cwd: CWD, stdio: 'pipe' });
            console.log("✅ PR is mergeable.");
        } catch (e) {
            console.log("❌ PR has conflicts or merge failed.");
            isMergeable = false;
        }

        if (!isMergeable) {
            console.log(`Closing PR #${pr.number} (not mergeable)...`);
            run(`gh pr close ${pr.number} --comment "Closing PR because it is not mergeable with main branch."`);

            // Clean up and reset
            run('git merge --abort', { ignoreErrors: true });
            run('git checkout main');
            continue;
        }

        // 4. Run Tests
        console.log("Installing dependencies...");
        const installOk = runSafe('npm', ['ci'], { stdio: 'ignore' });

        let testsPassed = false;
        if (installOk) {
            console.log("Running tests...");
            testsPassed = runSafe('npm', ['test']);
        } else {
            console.log("❌ Dependency installation failed.");
        }

        if (testsPassed) {
            console.log(`✅ Tests Passed for PR #${pr.number}.`);
        } else {
            console.log(`❌ Tests Failed (or build failed) for PR #${pr.number}.`);
        }

        console.log(`Merging PR #${pr.number}...`);
        const merged = runSafe('gh', ['pr', 'merge', pr.number.toString(), '--merge', '--delete-branch']);
        if (merged) {
            console.log(`[Result] PR #${pr.number} Merged.`);
        } else {
            console.log(`[Result] PR #${pr.number} Merge Failed.`);
            console.log(`Closing PR #${pr.number}...`);
            run(`gh pr close ${pr.number} --comment "Closing PR because merge failed."`);
        }

        // Reset to main for next iteration
        run('git checkout main');
        run('git clean -fd');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
