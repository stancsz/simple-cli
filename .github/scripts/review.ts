#!/usr/bin/env npx tsx
/**
 * Simple Code Review
 * Automated PR review and merge system for Simple CLI
 */
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';


// Configuration
const CWD = process.cwd();

// Jules API Client
class JulesClient {
    private apiBaseUrl: string;
    private apiKey?: string;

    constructor() {
        this.apiKey = process.env.JULES_API_KEY;
        this.apiBaseUrl = "https://jules.googleapis.com/v1alpha";
    }

    async createTaskForPR(prNumber: number, task: string): Promise<{ success: boolean, message: string }> {
        if (!this.apiKey) {
            return { success: false, message: "JULES_API_KEY not set" };
        }

        try {
            // Get PR details including body and comments to find existing session
            const prJson = run(`gh pr view ${prNumber} --json headRefName,headRepositoryOwner,headRepository,body,comments`);
            const prData = JSON.parse(prJson);
            const branch = prData.headRefName;
            const prBody = prData.body || '';
            const comments = prData.comments || [];

            // Combine body and all comment bodies for searching
            const allText = [prBody, ...comments.map((c: any) => c.body)].join('\n');

            // Get owner and repo from PR data (works reliably even after checking out branches)
            const owner = prData.headRepositoryOwner?.login || 'stancsz';
            const repo = prData.headRepository?.name || 'simple-cli';

            console.log(`Repository: ${owner}/${repo}, Branch: ${branch}`);

            // Check if this PR was created by Jules OR has an existing session mentioned in comments
            // Pattern: jules.google.com/task/{taskId} or jules.google.com/session/{sessionId}
            // Also match simple session ID format if we output it differently
            const sessionMatch = allText.match(/jules\.google\.com\/(?:task|sessions?)\/([a-zA-Z0-9-]+)/);

            if (sessionMatch) {
                const sessionId = sessionMatch[1];
                const sessionName = `sessions/${sessionId}`;
                console.log(`Found existing Jules session: ${sessionName}`);

                // Send message to existing session instead of creating new one
                const messageUrl = `${this.apiBaseUrl}/${sessionName}:sendMessage`;
                const messageBody = {
                    message: task
                };

                console.log(`Sending message to existing session...`);

                const messageRes = await fetch(messageUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": this.apiKey,
                    },
                    body: JSON.stringify(messageBody),
                });

                if (!messageRes.ok) {
                    const errorText = await messageRes.text();
                    console.error(`Failed to send message to session: ${errorText}`);
                    return { success: false, message: `Failed to continue existing Jules session: ${errorText}` };
                } else {
                    console.log(`✓ Message sent to existing Jules session`);
                    return { success: true, message: `Message sent to existing session: https://jules.google.com/session/${sessionId}` };
                }
            }

            // No existing session found -> Do NOT create a new one to prevent loops
            console.warn(`No existing Jules session found in PR #${prNumber} by Jules. Aborting task creation.`);
            return { success: false, message: "No existing Jules session found in PR description or comments. Cannot create task." };
        } catch (error: any) {
            console.error(`Jules API error:`, error);
            return { success: false, message: `Jules API error: ${error.message}` };
        }
    }
}

const julesClient = new JulesClient();

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

function commentOnPr(prNumber: number, body: string) {
    const commentFile = path.join(CWD, 'pr_comment_body.txt');
    try {
        console.log(`Posting comment on PR #${prNumber}...`);
        fs.writeFileSync(commentFile, body);
        run(`gh pr comment ${prNumber} --body-file "${commentFile}"`);
        console.log("Comment posted.");
    } catch (e) {
        console.error(`Failed to comment on PR #${prNumber}:`, e);
    } finally {
        if (fs.existsSync(commentFile)) {
            fs.unlinkSync(commentFile);
        }
    }
}

async function delegateComment(agentCli: string, pr: any, context: string, errorDetails: string = "") {
    console.log(`Delegating comment generation for PR #${pr.number}...`);

    const isJules = pr.author.login.toLowerCase().includes('jules') || pr.author.login.toLowerCase().includes('google-labs-jules');

    if (isJules) {
        // Use Jules API to create an actionable task
        console.log(`Detected Jules as PR author. Creating Jules task instead of comment...`);
        const task = `${context}\n\nError Details: ${errorDetails}\n\nPlease fix this issue in PR #${pr.number}.`;
        const result = await julesClient.createTaskForPR(pr.number, task);

        if (result.success) {
            console.log(`Jules task created successfully: ${result.message}`);
            // Also post a comment to notify
            commentOnPr(pr.number, `@jules I've created a task for you to fix this issue. ${result.message}`);
        } else {
            console.error(`Failed to create Jules task: ${result.message}`);
            // Fallback to regular comment
            commentOnPr(pr.number, `@jules ${context}\n\nError: ${errorDetails}\n\nNote: I tried to create an automated task but failed: ${result.message}`);
        }
    } else {
        // Use agent for non-Jules PRs
        const role = `You are a helpful Senior Developer reviewing a PR.`;
        const instructions = `Be professional and helpful.`;

        const prompt = `${role}
        
        Situation: ${context}
        Error Details: ${errorDetails}
        
        Task: Analyze the situation and post a comment on PR #${pr.number} using the 'pr_comment' tool.
        ${instructions}
        
        Do not just say you will do it, actually use the tool.`;

        // Run the isolated agent
        runSafe('npx', ['tsx', `"${agentCli}"`, '.', `"${prompt}"`, '--non-interactive']);
    }
}

function shouldSkipPR(prNumber: number): boolean {
    console.log(`Checking if PR #${prNumber} should be skipped...`);
    try {
        const prJson = run(`gh pr view ${prNumber} --json commits,comments,reviews,latestReviews`, { ignoreErrors: true });

        if (!prJson) {
            console.warn(`Could not fetch PR details for #${prNumber}. Proceeding...`);
            return false;
        }

        const data = JSON.parse(prJson);
        const commits = data.commits || [];
        const comments = data.comments || [];
        const reviews = data.reviews || []; // reviews might be empty or different structure

        if (commits.length === 0) return false;

        const latestCommit = commits[commits.length - 1];
        const latestCommitDate = new Date(latestCommit.committedDate);
        // console.log(`Latest commit date: ${latestCommitDate.toISOString()}`);

        let lastBotActivityDate = new Date(0);

        // Check comments
        for (const comment of comments) {
            const isBot = comment.author.login === 'github-actions' ||
                comment.author.login === 'Simple-CLI Bot' ||
                comment.body.includes('Simple Code Review') ||
                comment.body.includes('Jules task created');

            if (isBot) {
                const date = new Date(comment.createdAt);
                if (date > lastBotActivityDate) {
                    lastBotActivityDate = date;
                }
            }
        }

        // Check reviews if any
        if (reviews && reviews.length > 0) {
            for (const review of reviews) {
                const isBot = review.author.login === 'github-actions' ||
                    review.author.login === 'Simple-CLI Bot' ||
                    review.author.login.includes('jules'); // Be safer

                if (isBot) {
                    const date = new Date(review.submittedAt);
                    if (date > lastBotActivityDate) {
                        lastBotActivityDate = date;
                    }
                }
            }
        }

        // console.log(`Last bot activity: ${lastBotActivityDate.toISOString()}`);

        if (lastBotActivityDate > latestCommitDate) {
            return true;
        }

        return false;
    } catch (e: any) {
        console.error(`Error checking skip status: ${e.message}`);
        return false;
    }
}

async function main() {
    console.log("🔍 Simple Code Review");
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

    // X. Create Isolated Runtime
    // We copy the current repo (Main) to a neighbor directory to serve as the "Agent Runtime".
    // This ensures we always use the latest Agent code/skills vs the PR's potentially outdated code.
    const runtimeDir = path.resolve(CWD, '../simple-cli-agent');
    console.log(`Setting up Agent Runtime at ${runtimeDir}...`);
    try {
        if (fs.existsSync(runtimeDir)) {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
        // recursive copy excluding .git and node_modules to be faster? 
        // Actually we need node_modules for npx tsx to work natively without install
        // But copying node_modules is slow.
        // Let's assume we can CP everything.
        // Or better: We rely on the fact that GitHub Actions checks out to GITHUB_WORKSPACE.
        // We can just CP the critical parts: src, .agent, package.json, tsconfig.json
        fs.mkdirSync(runtimeDir, { recursive: true });
        run(`cp -r src package.json tsconfig.json .agent ${runtimeDir}`);

        // We need dependencies. If we don't copy node_modules, we must install.
        // CI environment usually has a cache.
        // Let's try to link node_modules? 
        // Windows/Linux symlink might work.
        try {
            if (process.platform === 'win32') {
                run(`mklink /J "${path.join(runtimeDir, 'node_modules')}" "${path.join(CWD, 'node_modules')}"`);
            } else {
                run(`ln -s "${path.join(CWD, 'node_modules')}" "${path.join(runtimeDir, 'node_modules')}"`);
            }
        } catch (e) {
            console.warn("Failed to symlink node_modules, trying copy (slow)...");
            run(`cp -r node_modules ${runtimeDir}`);
        }

        console.log("Agent Runtime ready.");
    } catch (e) {
        console.error("Failed to setup runtime:", e);
        process.exit(1);
    }

    const agentCli = path.join(runtimeDir, 'src/cli.ts');
    let jobsCreated = 0;


    for (const pr of prs) {
        console.log(`\n---------------------------------------------------`);
        console.log(`PR #${pr.number}: ${pr.title}`);
        console.log(`Author: ${pr.author.login} | Branch: ${pr.headRefName}`);
        console.log(`Mergeable: ${pr.mergeable}`);

        if (shouldSkipPR(pr.number)) {
            console.log(`⏭️  Skipping PR #${pr.number}: Already reviewed by Simple-CLI/Jules and no new commits.`);
            continue;
        }

        if (jobsCreated >= 1) {
            console.log("Limit of 1 active job per run reached. Stopping.");
            break;
        }
        jobsCreated++;

        const isJules = pr.author.login.toLowerCase().includes('jules') || pr.author.login.toLowerCase().includes('google-labs-jules');
        const mention = isJules ? '@jules ' : '';
        const instructionPrefix = isJules ? 'Please resolve the following issues:\n' : '';

        console.log(`Checking out PR #${pr.number}...`);
        run(`gh pr checkout ${pr.number}`);

        // Conflict Detection & Resolution
        let hasConflicts = (pr.mergeable === 'CONFLICTING');

        try {
            console.log("Merging origin/main locally to verify conflicts/update...");
            run('git fetch origin main');
            execSync('git merge origin/main', { cwd: CWD, stdio: 'pipe' });
            console.log("Merge successful (local).");
        } catch (e: any) {
            console.log("Merge conflict detected locally (or merge failure).");
            // Log stderr to help debugging
            if (e.stderr) console.error(e.stderr.toString());
            hasConflicts = true;
        }

        if (hasConflicts) {
            console.log(`⚠️  PR #${pr.number} has conflicts. Attempting to resolve...`);

            // Identify conflicting files
            const conflicts = run('git diff --name-only --diff-filter=U');

            if (!conflicts) {
                console.log("No conflicting files found locally (despite merge failure?). Proceeding with caution.");
                // We failed to merge but git diff shows no conflicts. likely unrelated error.
                await delegateComment(agentCli, pr,
                    "I attempted to merge `main` into this branch, but the operation failed. However, `git diff` shows no standard merge conflicts.",
                    "Possible unrelated git error or dirty state."
                );
            } else {
                console.log(`Conflicting files:\n${conflicts}`);

                const prompt = `You are a Senior Staff Engineer resolving a high-stakes merge conflict.

**Context:**
We have conflicting files:
${conflicts}

**Strategy (Three-Copy Logic):**
To resolve this accurately, you must retrieve and analyze three versions of each conflicting file:
1. **BASE** (Common Ancestor): \`git show $(git merge-base HEAD MERGE_HEAD):path/to/file\`
2. **OURS** (Current/Target): \`git show HEAD:path/to/file\`
3. **THEIRS** (Incoming/Source): \`git show MERGE_HEAD:path/to/file\`

**Task:**

1. **Intent Deconstruction**: 
   - Analyze the delta between BASE vs. OURS and BASE vs. THEIRS. 
   - Identify the specific functional intent of both changes.

2. **Conflict Analysis**: 
   - Locate textual overlaps. 
   - Determine if this is a simple "both-added" conflict or a "logic-clash" where one change invalidates the other's assumptions.

3. **Resolution Execution**: 
   - Propose a unified version that preserves the logic of both (or choose the superior logic if they are mutually exclusive).
   - If a function was renamed in OURS and modified in THEIRS, apply THEIRS' modification to the new name in OURS.
   - If imports were added in both, combine them.

4. **Verification Step**: 
   - Write the synthesized content to the file (overwriting the conflict markers).
   - Provide a list of "Sanity Tests"—specific functions or variables that must be checked.
   - Run \`npm test\` to ensure no semantic breakage occurred.

5. **Commit**: 
   - If verification passes, use \`git add\` and \`git commit\`.

**Constraints:**
- If the merge breaks the AST (syntax), you must iterate until it is valid.
- Prioritize 80/20 leverage: if a conflict is ambiguous, flag it for human intervention instead of guessing.

**Goal**: Resolve the conflicts in ${conflicts.replace(/\n/g, ', ')} avoiding syntax errors and logical regressions.`;

                // Allow the agent to use tools (read_file, write_file)
                // Usr the Isolated Runtime Agent !!
                // We pass "." as the first argument to tell the agent to work on CWD
                const status = runSafe('npx', ['tsx', `"${agentCli}"`, '.', `"${prompt}"`, '--non-interactive']);

                if (!status) {
                    console.error("Agent failed to resolve conflicts via CLI. Attempting fallback: Accept Feature Branch changes (Ours).");

                    try {
                        const conflictFiles = conflicts.split('\n').filter(f => f.trim());
                        for (const file of conflictFiles) {
                            console.log(`Checking out --ours for ${file}...`);
                            // We are on PR branch, merging main. ours = PR branch.
                            run(`git checkout --ours "${file}"`);
                            run(`git add "${file}"`);
                        }

                        run('git commit -m "chore: Resolve merge conflicts (fallback: keep feature branch)"');
                        run('git push');
                        console.log("✅ Conflicts resolved (fallback) and pushed.");
                        continue;
                    } catch (fallbackError: any) {
                        console.error(`Fallback resolution failed: ${fallbackError.message}`);
                        await delegateComment(agentCli, pr,
                            "I attempted to resolve the merge conflicts automatically (both agent and fallback), but I failed to complete the task.",
                            `Agent failed. Fallback error: ${fallbackError.message}`
                        );
                        continue;
                    }
                }

                // Try to commit
                try {
                    console.log("Committing resolution...");
                    run('git add .');
                    run('git commit -m "chore: Resolve merge conflicts via Simple-CLI"');
                    run('git push');
                    console.log("✅ Conflicts resolved and pushed.");
                } catch (e: any) {
                    console.error(`Failed to commit/push resolution: ${e.message}`);
                    await delegateComment(agentCli, pr,
                        "I successfully resolved the conflicts locally, but failed to push the changes to the remote branch.",
                        e.message
                    );
                    continue;
                }
                continue;
            }
        }


        console.log("Installing dependencies...");
        runSafe('npm', ['ci'], { stdio: 'ignore' });

        console.log("Running tests...");
        const testsPassed = runSafe('npm', ['test']);

        if (testsPassed) {
            console.log(`✅ Tests Passed for PR #${pr.number}.`);
            console.log(`Merging PR #${pr.number}...`);
            const merged = runSafe('gh', ['pr', 'merge', pr.number.toString(), '--merge', '--delete-branch']);
            if (merged) console.log(`[Result] PR #${pr.number} Merged.`);
            else console.log(`[Result] PR #${pr.number} Merge Failed (Check GH logs).`);
        } else {
            console.log(`❌ Tests Failed for PR #${pr.number}.`);
            console.log("Analyzing failure with Simple-CLI...");

            const logFile = 'pr_failure.log';
            try {
                // Capture failure output
                execSync('npm test', { cwd: CWD, encoding: 'utf-8' });
            } catch (e: any) {
                fs.writeFileSync(logFile, (e.stdout || '') + '\n' + (e.stderr || ''));
            }

            const prompt = `You are a Code Reviewer Agent. The tests for PR #${pr.number} failed. 
            
            Read 'pr_failure.log' to understand why.
            
            Then, use 'pr_comment' to post a helpul comment on PR #${pr.number} explaining the failure.
            
            Important: The PR author is '${pr.author.login}'. ${isJules ? "You MUST include '@jules' and give clear instructions." : "Be constructive."}
            `;

            // Run Agent using Isolated Runtime
            const status = runSafe('npx', ['tsx', `"${agentCli}"`, '.', `"${prompt}"`, '--non-interactive']);
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
