#!/usr/bin/env npx tsx
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
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
    console.log("🔍 Simple-CLI PR Reviewer");
    console.log("===============================");

    // 1. Check prerequisites
    try {
        const ghVersion = run('gh --version');
        console.log(`GitHub CLI found: ${ghVersion.split('\n')[0]}`);
    } catch (e) {
        console.error("❌ Error: GitHub CLI (gh) is not installed or not in PATH.");
        process.exit(1);
    }

    // 2. List Open PRs
    console.log("Fetching open PRs...");
    let prsJson;
    try {
        prsJson = run('gh pr list --json number,title,mergeable,headRefName,author --state open --limit 10');
    } catch (e) {
        console.error("Failed to fetch PRs.");
        process.exit(1);
    }

    if (!prsJson) {
        console.log("No output from gh pr list");
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
        console.log(`Author: ${pr.author.login} | Branch: ${pr.headRefName}`);
        console.log(`Mergeable: ${pr.mergeable}`);

        if (pr.mergeable === 'CONFLICTING') {
            console.log(`⚠️  PR #${pr.number} has conflicts. Attempting to resolve...`);

            console.log(`Checking out PR #${pr.number}...`);
            run(`gh pr checkout ${pr.number}`);

            try {
                console.log("Merging origin/main to trigger conflicts...");
                run('git fetch origin main');
                // We expect this to fail if there are conflicts
                execSync('git merge origin/main', { cwd: CWD, stdio: 'pipe' });
                console.log("Merge successful (no conflicts locally?).");
            } catch (e) {
                console.log("Merge conflict detected locally.");
            }

            // Identify conflicting files
            const conflicts = run('git diff --name-only --diff-filter=U');

            if (!conflicts) {
                console.log("No conflicting files found locally. Proceeding.");
            } else {
                console.log(`Conflicting files:\n${conflicts}`);

                const prompt = `You are a Senior Developer. We have merge conflicts in these files:\n${conflicts}\n\nRead these files, find conflict markers (<<<<<<<, =======, >>>>>>>), and resolve them. Keep the PR's intent but incorporate changes from main. Remove all markers.`;

                // Allow the agent to use tools (read_file, write_file)
                const status = runSafe('npx', ['tsx', 'src/cli.ts', `"${prompt}"`, '--non-interactive']);

                if (!status) {
                    console.error("Agent failed to resolve conflicts via CLI.");
                    // Continue to next PR or fail? Let's skip this one.
                    continue;
                }

                // Try to commit
                try {
                    console.log("Committing resolution...");
                    run('git add .');
                    // Check if anything is staged (if agent didn't change anything, commit might fail if empty? no, merge is pending)
                    run('git commit -m "chore: Resolve merge conflicts via Simple-CLI"');
                    run('git push');
                    console.log("✅ Conflicts resolved and pushed.");
                } catch (e: any) {
                    console.error(`Failed to commit/push resolution: ${e.message}`);
                    continue;
                }
            }
        }

        // Filter checks - enabled for safety during development, disabled for production usage if desired.
        // For now, we process ALL open PRs.
        // if (!pr.title.includes("Test PR")) { ... }

        console.log(`Checking out PR #${pr.number}...`);
        run(`gh pr checkout ${pr.number}`);

        console.log("Installing dependencies...");
        runSafe('npm', ['ci'], { stdio: 'ignore' }); // Use ci for clean install

        console.log("Running tests...");
        const testsPassed = runSafe('npm', ['test']);

        if (testsPassed) {
            console.log(`✅ Tests Passed for PR #${pr.number}.`);
            console.log(`Merging PR #${pr.number}...`);
            runSafe('gh', ['pr', 'merge', pr.number.toString(), '--merge', '--delete-branch']);
            console.log(`[Result] PR #${pr.number} Merged.`);
        } else {
            console.log(`❌ Tests Failed for PR #${pr.number}.`);
            console.log("Analyzing failure with Simple-CLI...");

            const logFile = 'pr_failure.log';
            try {
                // Capture failure output
                execSync('npm test', { cwd: CWD, encoding: 'utf-8', shell: true });
            } catch (e: any) {
                fs.writeFileSync(logFile, (e.stdout || '') + '\n' + (e.stderr || ''));
            }

            const prompt = `You are a Code Reviewer Agent. The tests for PR #${pr.number} failed. Read '${logFile}'. Use 'pr_comment' to explain the failure on PR #${pr.number}. Be concise.`;

            // Run Agent using npx tsx src/cli.ts
            // We use spawnSync to ensure it runs correctly
            const status = runSafe('npx', ['tsx', 'src/cli.ts', `"${prompt}"`, '--non-interactive']);
            if (status) console.log("Review comment posted via Agent.");
            else console.error("Agent failed to run.");
        }

        // Reset to main
        run('git checkout main');
        run('git clean -fd');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
